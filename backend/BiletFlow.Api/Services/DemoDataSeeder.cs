using System.Security.Cryptography;
using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace BiletFlow.Api.Services;

/// <summary>
/// Demonstration data for manual testing: one account per role and events that cover every main flow
/// (free and paid general admission, assigned seating, promo codes, refunds, check-in, support, moderation).
/// Runs only when <c>Seed:DemoData</c> is true and only on a database without the demo organizer, so it never
/// touches existing data. Everything is written in one transaction. Dates are relative to the moment of seeding.
/// </summary>
public sealed class DemoDataSeeder(
    AuthDbContext db, IPasswordHasher<AppUser> passwordHasher, AuditService audit, ILogger<DemoDataSeeder> logger)
{
    public const string Password = "Demo12345!";
    public const string OrganizerEmail = "organizer@biletflow.local";

    private DateTimeOffset now;

    public async Task SeedAsync()
    {
        if (await db.Users.AnyAsync(user => user.Email == OrganizerEmail)) return;

        now = DateTimeOffset.UtcNow;
        var hour = new DateTimeOffset(now.Year, now.Month, now.Day, now.Hour, 0, 0, TimeSpan.Zero);
        await using var transaction = await db.Database.BeginTransactionAsync();

        // ---- Accounts ------------------------------------------------------------------------------------------
        var organizer = AddUser(OrganizerEmail, "Aruzhan Sadykova", UserRole.Organizer);
        var newOrganizer = AddUser("organizer.new@biletflow.local", "Daniyar Omarov", UserRole.Organizer);
        var staff = AddUser("staff@biletflow.local", "Timur Akhmetov", UserRole.EventAdmin);
        var attendee = AddUser("attendee@biletflow.local", "Aigerim Nurlanovna", UserRole.Attendee);
        var attendee2 = AddUser("attendee2@biletflow.local", "Alikhan Seitkali", UserRole.Attendee);
        AddUser("unverified@biletflow.local", "Unverified Demo User", UserRole.Attendee, emailConfirmed: false);
        AddUser("suspended@biletflow.local", "Suspended Demo User", UserRole.Attendee, suspended: true);

        db.OrganizerProfiles.Add(new OrganizerProfile
        {
            UserId = organizer.Id, BusinessName = "Steppe Live LLP", DisplayName = "Steppe Live Events",
            ContactEmail = organizer.Email, IsVerified = true,
            SandboxPayoutProvider = "BiletFlow Sandbox (simulation)",
            SandboxPayoutReference = $"SANDBOX-{organizer.Id.ToString("N")[..12].ToUpperInvariant()}"
        });
        db.OrganizerProfiles.Add(new OrganizerProfile
        {
            UserId = newOrganizer.Id, BusinessName = "Clay Studio", DisplayName = "Clay Studio Astana",
            ContactEmail = newOrganizer.Email
        });

        // ---- 1. Free general-admission meetup ------------------------------------------------------------------
        var meetup = AddEvent(organizer, "Almaty Tech Meetup", "almaty-tech-meetup-demo", 1, "Almaty", "Technology",
            "An evening of short talks about backend development, mobile apps and AI tools. Free entry, registration required.",
            "SmartPoint Hub", "Dostyk Avenue 52, Almaty", hour.AddDays(7).AddHours(2), 3, capacity: 100);
        var meetupFree = AddTicketType(meetup, "Free entry", 0m, 100, "Registration for one person.");

        // ---- 2. Paid general-admission concert with a promo code ------------------------------------------------
        var jazz = AddEvent(organizer, "Jazz Night in Astana", "jazz-night-astana-demo", 2, "Astana", "Music",
            "Live jazz quartet with special guests. Doors open one hour before the show.",
            "Astana Concert Hall", "Kabanbay Batyr Avenue 11, Astana", hour.AddDays(14).AddHours(4), 3,
            refundPolicy: "Full refund up to 48 hours before the concert.");
        var jazzStandard = AddTicketType(jazz, "Standard", 8000m, 150, "General admission, standing area.");
        var jazzVip = AddTicketType(jazz, "VIP", 20000m, 30, "Front tables and a welcome drink.", maxPerOrder: 4);
        ActivatePaidSales(jazz, organizer);
        var jazzPromo = new PromoCampaign
        {
            EventId = jazz.Id, CreatedByUserId = organizer.Id, Code = "JAZZ10", CampaignToken = CreateToken("CMP_"),
            DiscountType = PromoDiscountType.Percentage, DiscountValue = 10m, MaxRedemptions = 50, LinkVisits = 12
        };
        db.PromoCampaigns.Add(jazzPromo);
        db.PromoCampaigns.Add(new PromoCampaign
        {
            EventId = jazz.Id, CreatedByUserId = organizer.Id, Code = "VIP5000", CampaignToken = CreateToken("CMP_"),
            DiscountType = PromoDiscountType.FixedKzt, DiscountValue = 5000m, MaxRedemptions = 10,
            ApplicableTicketTypes = { new PromoCampaignTicketType { TicketTypeId = jazzVip.Id } }
        });
        Audit(AuditActionType.PromoCampaignCreated, nameof(PromoCampaign), jazzPromo.Id, jazz, organizer, "Promo campaign 'JAZZ10' created.");

        // ---- 3. Assigned seating in the demo hall ---------------------------------------------------------------
        var symphony = AddEvent(organizer, "Symphony Evening", "symphony-evening-demo", 1, "Almaty", "Classical",
            "Tchaikovsky and Rachmaninoff performed by the city philharmonic orchestra. Choose your seat on the hall map.",
            "BiletFlow Demo Hall", "Abay Avenue 1, Almaty, Kazakhstan", hour.AddDays(21).AddHours(3), 2);
        symphony.SeatingMode = SeatingMode.Assigned;
        symphony.VenueId = SeatingService.DemoVenueId;
        var sections = await db.VenueSections.Include(section => section.Seats)
            .Where(section => section.VenueId == SeatingService.DemoVenueId)
            .ToDictionaryAsync(section => section.Name);
        var seatedTypes = new Dictionary<string, TicketType>
        {
            ["VIP"] = AddTicketType(symphony, "VIP", 25000m, sections["VIP"].Seats.Count, "Rows A–B."),
            ["Parterre"] = AddTicketType(symphony, "Parterre", 12000m, sections["Parterre"].Seats.Count, "Rows C–H, accessible seats in row H."),
            ["Balcony"] = AddTicketType(symphony, "Balcony", 6000m, sections["Balcony"].Seats.Count, "Rows J–K.")
        };
        foreach (var (name, ticketType) in seatedTypes)
        {
            db.TicketTypeSections.Add(new TicketTypeSection { EventId = symphony.Id, TicketTypeId = ticketType.Id, SectionId = sections[name].Id });
        }
        ActivatePaidSales(symphony, organizer);
        Audit(AuditActionType.SeatingConfigured, nameof(Event), symphony.Id, symphony, organizer, "Assigned-seating layout configured.");

        // ---- 4. Draft (not published) ---------------------------------------------------------------------------
        var draft = AddEvent(organizer, "Summer Open-Air Festival (draft)", "summer-open-air-festival-demo", 3, "Shymkent", "Festival",
            "A draft event that is not published yet: only the organizer and platform admins can open it.",
            "Central Park", "Tauke Khan Avenue 5, Shymkent", hour.AddDays(60), 8, published: false);
        AddTicketType(draft, "Day pass", 0m, 500);

        // ---- 5. Past event, already completed -------------------------------------------------------------------
        var past = AddEvent(organizer, "Startup Pitch Day", "startup-pitch-day-demo", 1, "Almaty", "Business",
            "Ten startups pitched to investors. This event is in the past and shows the Completed status.",
            "Astana Hub Almaty", "Al-Farabi Avenue 17, Almaty", hour.AddDays(-10), 4);
        var pastFree = AddTicketType(past, "Guest", 0m, 50);

        // ---- 6. New organizer: paid event whose paid sales are not activated yet ---------------------------------
        var workshop = AddEvent(newOrganizer, "Pottery Workshop for Beginners", "pottery-workshop-demo", 2, "Astana", "Workshop",
            "Two-hour hands-on pottery class. Paid sales still need to be activated by the organizer.",
            "Clay Studio", "Turan Avenue 24, Astana", hour.AddDays(10).AddHours(5), 2, published: false);
        AddTicketType(workshop, "Seat at the wheel", 15000m, 12, "Materials and firing included.", maxPerOrder: 2);

        // ---- Event admin (door staff) assignments ---------------------------------------------------------------
        foreach (var ev in new[] { meetup, jazz, symphony, past })
        {
            db.EventAdminAssignments.Add(new EventAdminAssignment { EventId = ev.Id, UserId = staff.Id, AssignedByUserId = organizer.Id });
            Audit(AuditActionType.EventAdminAssigned, nameof(EventAdminAssignment), staff.Id, ev, organizer, $"{staff.Email} assigned as event admin.");
        }

        // ---- Orders and tickets ---------------------------------------------------------------------------------
        AddConfirmedOrder(attendee, meetup, [(meetupFree, null), (meetupFree, null)], daysAgo: 2);
        AddConfirmedOrder(attendee2, meetup, [(meetupFree, null)], daysAgo: 1);

        var jazzOrder = AddConfirmedOrder(attendee, jazz, [(jazzStandard, null), (jazzStandard, null)], daysAgo: 3, promo: jazzPromo);
        var refundedOrder = AddConfirmedOrder(attendee2, jazz, [(jazzVip, null)], daysAgo: 5);
        RefundOrder(refundedOrder, jazz, organizer, attendee2, "The attendee can no longer attend.");

        var parterre = sections["Parterre"].Seats.Where(seat => seat.RowLabel == "D").OrderBy(seat => int.Parse(seat.Number)).ToList();
        var symphonyOrder = AddConfirmedOrder(attendee, symphony,
            [(seatedTypes["Parterre"], parterre[6]), (seatedTypes["Parterre"], parterre[7])], daysAgo: 1);
        var vipSeat = sections["VIP"].Seats.Single(seat => seat.RowLabel == "A" && seat.Number == "5");
        AddConfirmedOrder(attendee2, symphony, [(seatedTypes["VIP"], vipSeat)], daysAgo: 1);

        var pastOrder = AddConfirmedOrder(attendee, past, [(pastFree, null)], daysAgo: 14);
        AddConfirmedOrder(attendee2, past, [(pastFree, null)], daysAgo: 13);
        CheckIn(pastOrder.Items.First().Ticket!, past, staff);

        // ---- Support cases --------------------------------------------------------------------------------------
        var seatingCase = AddCase(attendee, SupportCaseType.Attendee, "seating", "Can I move to row C?", SupportCaseStatus.InProgress,
            symphony, symphonyOrder,
            (attendee, "Hello! Is it possible to swap my two Parterre seats in row D for row C?"),
            (organizer, "Hi Aigerim, row C is still available. Please cancel and re-book, or wait until we open seat exchange."));
        AddCase(attendee2, SupportCaseType.Attendee, "refund", "When will my VIP refund arrive?", SupportCaseStatus.Resolved,
            jazz, refundedOrder,
            (attendee2, "I received a refund notice for my VIP ticket. When will the money arrive?"),
            (organizer, "The refund was processed in full. In this demonstration no real money moves."));
        var activationCase = AddCase(newOrganizer, SupportCaseType.Organizer, "activation", "How do I start selling paid tickets?",
            SupportCaseStatus.Open, workshop, null,
            (newOrganizer, "I created a paid ticket type but checkout says paid sales are not active. What should I do?"));
        activationCase.IsEscalated = true;

        // ---- Moderation report ----------------------------------------------------------------------------------
        db.EventReports.Add(new EventReport
        {
            EventId = meetup.Id, ReporterUserId = attendee2.Id, Reason = "Misleading information",
            Details = "The venue address on the page looks different from the one in the invitation email.",
            CreatedAt = now.AddHours(-6)
        });

        // ---- Notifications --------------------------------------------------------------------------------------
        Notify(organizer, "SupportCase", "New support message", "Aigerim Nurlanovna asked about moving seats for Symphony Evening.",
            symphony.Id, caseId: seatingCase.Id);
        Notify(newOrganizer, "PaidSales", "Activate paid sales", "Complete the paid-sales checklist to start selling Pottery Workshop tickets.",
            workshop.Id);

        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        logger.LogInformation("Seeded demonstration data. Demo accounts use the password {Password}.", Password);
    }

    private AppUser AddUser(string email, string fullName, UserRole role, bool emailConfirmed = true, bool suspended = false)
    {
        var user = new AppUser
        {
            Email = email, PasswordHash = string.Empty, FullName = fullName, Role = role,
            EmailConfirmed = emailConfirmed, IsSuspended = suspended, CreatedAt = now.AddDays(-30)
        };
        user.PasswordHash = passwordHasher.HashPassword(user, Password);
        db.Users.Add(user);
        return user;
    }

    private Event AddEvent(
        AppUser organizer, string title, string slug, int cityId, string city, string category, string description,
        string venue, string address, DateTimeOffset start, int durationHours, int? capacity = null,
        string? refundPolicy = null, bool published = true)
    {
        var ev = new Event
        {
            OrganizerId = organizer.Id, Title = title, Slug = slug, Description = description, Venue = venue,
            CityId = cityId, City = city, VenueAddress = address, Category = category, RefundPolicy = refundPolicy,
            StartDateUtc = start, EndDateUtc = start.AddHours(durationHours), IsPublished = published,
            Capacity = capacity, CreatedAt = now.AddDays(-20)
        };
        db.Events.Add(ev);
        Audit(AuditActionType.EventCreated, nameof(Event), ev.Id, ev, organizer, $"Event '{title}' created.");
        if (published) Audit(AuditActionType.EventPublished, nameof(Event), ev.Id, ev, organizer, $"Event '{title}' published.");
        return ev;
    }

    private TicketType AddTicketType(Event ev, string name, decimal price, int quantity, string? description = null, int maxPerOrder = 10)
    {
        var ticketType = new TicketType
        {
            EventId = ev.Id, Name = name, Description = description, Price = price, Quantity = quantity, MaxPerOrder = maxPerOrder
        };
        ev.TicketTypes.Add(ticketType);
        return ticketType;
    }

    private void ActivatePaidSales(Event ev, AppUser organizer)
    {
        var activatedAt = now.AddDays(-15);
        ev.PaidSalesStatus = PaidSalesStatus.Active;
        ev.PaidTermsAccepted = true;
        var activation = new PaidSalesActivation
        {
            EventId = ev.Id, OrganizerId = organizer.Id, FeeAmount = 5000m,
            FeePaidAt = activatedAt, TermsAcceptedAt = activatedAt, ActivatedAt = activatedAt
        };
        db.PaidSalesActivations.Add(activation);
        Audit(AuditActionType.ActivationFeePaid, nameof(PaidSalesActivation), activation.Id, ev, organizer,
            "Paid Sales Activation Fee of 5000.00 KZT recorded (simulation; no money moved).");
        Audit(AuditActionType.PaidSalesActivated, nameof(Event), ev.Id, ev, organizer, "Paid sales activated (simulation).");
    }

    /// <summary>Adds a confirmed order with one ticket per item, a simulated payment when paid, and updates the sold counters.</summary>
    private Order AddConfirmedOrder(
        AppUser buyer, Event ev, IReadOnlyList<(TicketType Type, Seat? Seat)> items, int daysAgo, PromoCampaign? promo = null)
    {
        var createdAt = now.AddDays(-daysAgo);
        var order = new Order
        {
            AttendeeId = buyer.Id, EventId = ev.Id, AttendeeName = buyer.FullName, AttendeeEmail = buyer.Email,
            Status = OrderStatus.Confirmed, CreatedAt = createdAt, ConfirmedAt = createdAt.AddMinutes(2)
        };
        foreach (var (type, seat) in items)
        {
            var item = new OrderItem
            {
                Order = order, TicketTypeId = type.Id, TicketTypeName = type.Name, UnitPrice = type.Price,
                DiscountAmount = promo is null ? 0m : decimal.Round(type.Price * promo.DiscountValue / 100m, 2),
                SeatId = seat?.Id
            };
            item.Ticket = new Ticket
            {
                OrderItem = item, EventId = ev.Id, Code = CreateToken("TKT_"), AttendeeName = buyer.FullName,
                AttendeeEmail = buyer.Email, SeatId = seat?.Id
            };
            order.Items.Add(item);
            type.SoldQuantity++;
            ev.TicketsIssued++;
        }

        order.DiscountTotal = order.Items.Sum(item => item.DiscountAmount);
        order.Total = order.Items.Sum(item => item.UnitPrice) - order.DiscountTotal;
        if (promo is not null)
        {
            order.PromoCampaignId = promo.Id;
            order.PromoCode = promo.Code;
        }

        if (order.Total > 0)
        {
            order.FeeTotal = decimal.Round(order.Total * 2.5m / 100m, 2);
            order.Payments.Add(new Payment { Amount = order.Total, Status = PaymentStatus.Succeeded, CreatedAt = order.ConfirmedAt.Value });
        }

        db.Orders.Add(order);
        Audit(AuditActionType.OrderCreated, nameof(Order), order.Id, ev, buyer,
            $"Order created: {order.Items.Count} ticket(s), total {order.Total:0.00} KZT.");
        if (order.Total > 0)
        {
            Audit(AuditActionType.PaymentSucceeded, nameof(Payment), order.Id, ev, buyer,
                $"Simulated payment of {order.Total:0.00} KZT succeeded (processing fee {order.FeeTotal:0.00} KZT).");
        }

        var kind = order.Total == 0 ? "Registration" : "Purchase";
        Notify(buyer, "OrderConfirmed", $"{kind} confirmed: {ev.Title}",
            $"Your {kind.ToLowerInvariant()} for {ev.Title} is confirmed. {order.Items.Count} ticket(s) are in your account.",
            ev.Id, order.Id, createdAt: order.ConfirmedAt);
        return order;
    }

    private void RefundOrder(Order order, Event ev, AppUser actor, AppUser buyer, string reason)
    {
        foreach (var item in order.Items)
        {
            item.Ticket!.Status = TicketStatus.Refunded;
            ev.TicketTypes.Single(type => type.Id == item.TicketTypeId).SoldQuantity--;
            ev.TicketsIssued--;
        }

        order.Status = OrderStatus.Refunded;
        order.Refunds.Add(new Refund
        {
            EventId = ev.Id, Amount = order.Total, Reason = reason, InitiatedByUserId = actor.Id, CreatedAt = now.AddDays(-2)
        });
        Audit(AuditActionType.OrderRefunded, nameof(Order), order.Id, ev, actor,
            $"Full refund of {order.Total:0.00} KZT (simulation): {reason}");
        Notify(buyer, "RefundCompleted",
            $"Refund completed: {ev.Title}",
            $"Your order for {ev.Title} was refunded in full ({order.Total:0.00} KZT, simulation). Its tickets are no longer valid.",
            ev.Id, order.Id);
    }

    private void CheckIn(Ticket ticket, Event ev, AppUser staff)
    {
        ticket.Status = TicketStatus.CheckedIn;
        db.TicketCheckIns.Add(new TicketCheckIn
        {
            Ticket = ticket, EventId = ev.Id, CheckedInByUserId = staff.Id, CheckedInAt = ev.StartDateUtc.AddMinutes(-20)
        });
        Audit(AuditActionType.TicketCheckedIn, nameof(Ticket), ticket.Id, ev, staff, "Ticket checked in by authorized event staff.");
    }

    private SupportCase AddCase(
        AppUser requester, SupportCaseType type, string category, string subject, SupportCaseStatus status,
        Event? ev, Order? order, params (AppUser Sender, string Body)[] messages)
    {
        var createdAt = now.AddHours(-messages.Length * 3 - 1);
        var supportCase = new SupportCase
        {
            RequesterUserId = requester.Id, Type = type, Category = category, Subject = subject, Status = status,
            EventId = ev?.Id, OrderId = order?.Id, CreatedAt = createdAt, UpdatedAt = createdAt.AddHours(messages.Length * 3)
        };
        for (var index = 0; index < messages.Length; index++)
        {
            supportCase.Messages.Add(new SupportMessage
            {
                SenderUserId = messages[index].Sender.Id, Body = messages[index].Body, CreatedAt = createdAt.AddHours(index * 3)
            });
        }

        db.SupportCases.Add(supportCase);
        Audit(AuditActionType.SupportCaseCreated, nameof(SupportCase), supportCase.Id, ev, requester, $"Support case '{subject}' created.");
        return supportCase;
    }

    private void Notify(
        AppUser user, string type, string title, string message, Guid? eventId = null, Guid? orderId = null,
        Guid? caseId = null, DateTimeOffset? createdAt = null) =>
        db.InAppNotifications.Add(new InAppNotification
        {
            UserId = user.Id, Type = type, Title = title, Message = message, RelatedEventId = eventId,
            RelatedOrderId = orderId, RelatedCaseId = caseId, CreatedAt = createdAt ?? now
        });

    private void Audit(AuditActionType action, string entityType, Guid? entityId, Event? ev, AppUser actor, string description) =>
        audit.Add(action, entityType, entityId, ev?.Id, actor.Id, description);

    /// <summary>Same format as real ticket codes and campaign tokens: a prefix plus 32 random bytes in base64url.</summary>
    private static string CreateToken(string prefix) => prefix + Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
        .TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
