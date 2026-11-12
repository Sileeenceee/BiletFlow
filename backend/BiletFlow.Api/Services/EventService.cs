using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;
using System.Data;

namespace BiletFlow.Api.Services;

public sealed class EventService(
    AuthDbContext db, AuditService audit, TicketingService ticketing, NotificationService notifications)
{
    private static readonly string[] LifecycleStatuses = ["Upcoming", "Active", "Completed", "Cancelled"];

    /// <summary>Public, published, non-suspended events that have not ended, with optional text/city/category filters.</summary>
    public async Task<IReadOnlyList<Event>> GetPublishedEventsAsync(string? search = null, string? city = null, string? category = null)
    {
        var now = DateTimeOffset.UtcNow;
        var query = db.Events.AsNoTracking()
            .Where(e => e.IsPublished && !e.IsCancelled && !e.IsSuspended && e.Visibility == EventVisibility.Public &&
                e.EndDateUtc > now);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = $"%{search.Trim()}%";
            query = query.Where(e => EF.Functions.ILike(e.Title, term) || EF.Functions.ILike(e.Description, term) ||
                EF.Functions.ILike(e.Venue, term));
        }
        if (!string.IsNullOrWhiteSpace(city)) query = query.Where(e => EF.Functions.ILike(e.City, city.Trim()));
        if (!string.IsNullOrWhiteSpace(category)) query = query.Where(e => e.Category != null && EF.Functions.ILike(e.Category, category.Trim()));

        return await query.OrderBy(e => e.StartDateUtc).ToListAsync();
    }

    /// <summary>The organizer's events, optionally limited to one lifecycle status (Upcoming, Active, Completed, Cancelled).</summary>
    public async Task<(IReadOnlyList<Event>? Events, string? Error)> GetOrganizerEventsAsync(Guid organizerId, string? status = null)
    {
        if (!string.IsNullOrWhiteSpace(status) && !LifecycleStatuses.Contains(status, StringComparer.OrdinalIgnoreCase))
        {
            return (null, "Status must be Upcoming, Active, Completed or Cancelled.");
        }

        var events = await db.Events.AsNoTracking()
            .Where(e => e.OrganizerId == organizerId)
            .OrderByDescending(e => e.StartDateUtc)
            .ToListAsync();
        if (string.IsNullOrWhiteSpace(status)) return (events, null);

        var now = DateTimeOffset.UtcNow;
        return (events.Where(e => string.Equals(e.GetLifecycleStatus(now), status, StringComparison.OrdinalIgnoreCase)).ToList(), null);
    }

    /// <summary>
    /// Organizers and platform admins can open any of their events, including drafts (preview), cancelled and suspended ones.
    /// Others see published, non-cancelled, non-suspended events that are public or unlisted.
    /// </summary>
    public async Task<Event?> GetEventAsync(Guid eventId, Guid? requesterId, bool isPlatformAdmin)
    {
        var ev = await db.Events.AsNoTracking().SingleOrDefaultAsync(candidate => candidate.Id == eventId);
        if (ev is null) return null;

        var canManage = isPlatformAdmin || requesterId == ev.OrganizerId;
        if (canManage) return ev;
        return ev.IsPublished && !ev.IsCancelled && !ev.IsSuspended && ev.Visibility != EventVisibility.Private ? ev : null;
    }

    public async Task<(Event? Event, string? Error)> CreateAsync(Guid organizerId, CreateEventRequest request)
    {
        var organizer = await db.Users.SingleOrDefaultAsync(user => user.Id == organizerId);
        if (organizer is null) return (null, "Organizer not found.");

        if (organizer.Role != UserRole.Organizer && organizer.Role != UserRole.PlatformAdmin)
        {
            return (null, "Only organizers can create events.");
        }

        var error = ValidateRequest(request);
        if (error is not null) return (null, error);
        if (request.IsPublished && !CanPublish(organizer)) return (null, "Verify your email address before publishing events.");

        var slug = GenerateSlug(request.Title);
        if (string.IsNullOrWhiteSpace(slug)) return (null, "A valid title is required.");

        var now = DateTimeOffset.UtcNow;
        var ev = new Event
        {
            OrganizerId = organizerId,
            Slug = await GenerateUniqueSlugAsync(slug),
            CreatedAt = now,
            UpdatedAt = now
        };
        Apply(ev, request);

        db.Events.Add(ev);
        audit.Add(AuditActionType.EventCreated, nameof(Event), ev.Id, ev.Id, organizerId, $"Event '{ev.Title}' created.");
        if (ev.IsPublished)
        {
            audit.Add(AuditActionType.EventPublished, nameof(Event), ev.Id, ev.Id, organizerId, "Event published.");
        }

        await db.SaveChangesAsync();
        return (ev, null);
    }

    public async Task<(Event? Event, string? Error)> UpdateAsync(
        Guid eventId, Guid organizerId, bool isPlatformAdmin, CreateEventRequest request)
    {
        var ev = await GetManagedEventAsync(eventId, organizerId, isPlatformAdmin);
        if (ev is null) return (null, "Event not found.");
        if (ev.IsCancelled) return (null, "A cancelled event cannot be updated.");

        var error = ValidateRequest(request);
        if (error is not null) return (null, error);
        if (request.Capacity is not null && request.Capacity < ev.TicketsIssued + ev.TicketsReserved)
        {
            return (null, "Capacity cannot be lower than tickets already issued or reserved.");
        }

        if (request.IsPublished && !ev.IsPublished && !isPlatformAdmin)
        {
            var organizer = await db.Users.SingleAsync(user => user.Id == organizerId);
            if (!CanPublish(organizer)) return (null, "Verify your email address before publishing events.");
        }

        var slug = GenerateSlug(request.Title);
        if (string.IsNullOrWhiteSpace(slug)) return (null, "A valid title is required.");

        var wasPublished = ev.IsPublished;
        var attendeeFacingChanges = DescribeAttendeeFacingChanges(ev, request);
        var otherChanges = ev.Capacity != request.Capacity
            ? $"capacity {(ev.Capacity?.ToString() ?? "unlimited")} → {(request.Capacity?.ToString() ?? "unlimited")}"
            : null;

        ev.Slug = await GenerateUniqueSlugAsync(slug, eventId);
        Apply(ev, request);
        ev.UpdatedAt = DateTimeOffset.UtcNow;

        var changeList = attendeeFacingChanges.Append(otherChanges).Where(change => change is not null).ToList();
        audit.Add(AuditActionType.EventUpdated, nameof(Event), ev.Id, ev.Id, organizerId,
            changeList.Count == 0 ? "Event details updated." : $"Event updated: {string.Join("; ", changeList)}.");
        if (wasPublished != ev.IsPublished)
        {
            audit.Add(ev.IsPublished ? AuditActionType.EventPublished : AuditActionType.EventUnpublished,
                nameof(Event), ev.Id, ev.Id, organizerId, ev.IsPublished ? "Event published." : "Event unpublished.");
        }

        if (attendeeFacingChanges.Count > 0) await NotifyTicketHoldersOfUpdateAsync(ev, attendeeFacingChanges);

        await db.SaveChangesAsync();
        return (ev, null);
    }

    /// <summary>
    /// Copies the reusable configuration of an event (details, ticket types, seating layout) into a new unpublished
    /// draft. Orders, tickets, payments, check-ins, campaigns and support cases are never copied (SRS 4.16, UC12).
    /// </summary>
    public async Task<(Event? Event, string? Error)> DuplicateAsync(Guid eventId, Guid organizerId, bool isPlatformAdmin)
    {
        var source = await db.Events
            .Include(candidate => candidate.TicketTypes)
            .SingleOrDefaultAsync(candidate => candidate.Id == eventId &&
                (candidate.OrganizerId == organizerId || isPlatformAdmin));
        if (source is null) return (null, "Event not found.");

        var now = DateTimeOffset.UtcNow;
        var ticketTypeMap = source.TicketTypes.ToDictionary(ticketType => ticketType.Id, ticketType => new TicketType
        {
            Name = ticketType.Name,
            Description = ticketType.Description,
            Price = ticketType.Price,
            Quantity = ticketType.Quantity,
            SalesStartAt = ticketType.SalesStartAt,
            SalesEndAt = ticketType.SalesEndAt,
            MaxPerOrder = ticketType.MaxPerOrder,
            IsHidden = ticketType.IsHidden
        });
        var copy = new Event
        {
            OrganizerId = source.OrganizerId,
            Title = source.Title.Length > 113 ? $"{source.Title[..113]} (copy)" : $"{source.Title} (copy)",
            Slug = await GenerateUniqueSlugAsync(GenerateSlug($"{source.Title} copy")),
            Description = source.Description,
            Venue = source.Venue,
            City = source.City,
            VenueAddress = source.VenueAddress,
            Timezone = source.Timezone,
            RefundPolicy = source.RefundPolicy,
            SeatingMode = source.SeatingMode,
            VenueId = source.VenueId,
            Category = source.Category,
            ImageUrls = [.. source.ImageUrls],
            StartDateUtc = source.StartDateUtc,
            EndDateUtc = source.EndDateUtc,
            IsPublished = false,
            Visibility = source.Visibility,
            RegistrationOpensAt = source.RegistrationOpensAt,
            RegistrationClosesAt = source.RegistrationClosesAt,
            Capacity = source.Capacity,
            CreatedAt = now,
            UpdatedAt = now,
            TicketTypes = ticketTypeMap.Values.ToList()
        };

        db.Events.Add(copy);
        var sectionLinks = await db.TicketTypeSections.AsNoTracking().Where(link => link.EventId == eventId).ToListAsync();
        foreach (var link in sectionLinks)
        {
            db.TicketTypeSections.Add(new TicketTypeSection
            {
                EventId = copy.Id, SectionId = link.SectionId, TicketTypeId = ticketTypeMap[link.TicketTypeId].Id
            });
        }

        audit.Add(AuditActionType.EventDuplicated, nameof(Event), copy.Id, source.Id, organizerId,
            $"Event duplicated into a new draft '{copy.Title}'.");
        audit.Add(AuditActionType.EventCreated, nameof(Event), copy.Id, copy.Id, organizerId,
            $"Draft created as a copy of '{source.Title}' (no orders, tickets or attendees copied).");
        await db.SaveChangesAsync();
        return (copy, null);
    }

    public async Task<(bool Deleted, string? Error)> DeleteAsync(Guid eventId, Guid organizerId, bool isPlatformAdmin)
    {
        var ev = await GetManagedEventAsync(eventId, organizerId, isPlatformAdmin);
        if (ev is null) return (false, "Event not found.");
        if (await db.Orders.AnyAsync(order => order.EventId == eventId) ||
            await db.SupportCases.AnyAsync(supportCase => supportCase.EventId == eventId) ||
            await db.AuditLogs.AnyAsync(log => log.EventId == eventId && log.ActionType == AuditActionType.EventPublished))
        {
            return (false, "Events that were published or have order or support history cannot be deleted. Cancel the event instead.");
        }

        var campaigns = await db.PromoCampaigns.Where(campaign => campaign.EventId == eventId).ToListAsync();
        db.PromoCampaigns.RemoveRange(campaigns);
        db.Events.Remove(ev);
        audit.Add(AuditActionType.EventDeleted, nameof(Event), ev.Id, ev.Id, organizerId, $"Unpublished draft '{ev.Title}' deleted.");
        await db.SaveChangesAsync();
        return (true, null);
    }

    /// <summary>
    /// Cancels the event and settles its orders in one transaction: pending orders are released, free registrations
    /// cancelled and paid orders refunded (simulated). Ticket holders are notified.
    /// </summary>
    public async Task<(Event? Event, string? Error)> CancelAsync(Guid eventId, Guid organizerId, bool isPlatformAdmin)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var ev = await db.Events.SingleOrDefaultAsync(candidate =>
            candidate.Id == eventId && (candidate.OrganizerId == organizerId || isPlatformAdmin));
        if (ev is null) return (null, "Event not found.");
        if (ev.IsCancelled) return (ev, null);

        await ticketing.SettleOrdersForCancelledEventAsync(ev, organizerId);

        ev.IsCancelled = true;
        ev.IsPublished = false;
        ev.UpdatedAt = DateTimeOffset.UtcNow;
        audit.Add(AuditActionType.EventCancelled, nameof(Event), ev.Id, ev.Id, organizerId,
            isPlatformAdmin && ev.OrganizerId != organizerId ? "Event cancelled by a platform administrator." : "Event cancelled by its organizer.");
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return (ev, null);
    }

    /// <summary>Chronological activity timeline of an event (SRS 4.16), newest first, with date-range and action filters.</summary>
    public async Task<(IReadOnlyList<EventHistoryEntry>? Entries, string? Error)> GetHistoryAsync(
        Guid eventId, Guid requesterId, bool isPlatformAdmin, DateTimeOffset? from, DateTimeOffset? to, string? actionType)
    {
        if (await GetManagedEventAsync(eventId, requesterId, isPlatformAdmin) is null) return (null, "Event not found.");

        var query = db.AuditLogs.AsNoTracking().Where(log => log.EventId == eventId);
        if (from is not null) query = query.Where(log => log.CreatedAt >= from);
        if (to is not null) query = query.Where(log => log.CreatedAt <= to);
        if (!string.IsNullOrWhiteSpace(actionType))
        {
            var types = new List<AuditActionType>();
            foreach (var part in actionType.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (!Enum.TryParse<AuditActionType>(part, true, out var parsed)) return (null, $"Unknown activity type '{part}'.");
                types.Add(parsed);
            }

            query = query.Where(log => types.Contains(log.ActionType));
        }

        var entries = await query
            .OrderByDescending(log => log.CreatedAt)
            .Take(1000)
            .Select(log => new EventHistoryEntry(
                log.Id, log.CreatedAt, log.ActorUserId,
                db.Users.Where(user => user.Id == log.ActorUserId).Select(user => user.Email).FirstOrDefault(),
                log.ActionType.ToString(), log.EntityType, log.EntityId, log.Description))
            .ToListAsync();
        return (entries, null);
    }

    public static IReadOnlyList<string> ActivityTypes => Enum.GetNames<AuditActionType>();

    private async Task NotifyTicketHoldersOfUpdateAsync(Event ev, IReadOnlyList<string> changes)
    {
        var holders = await db.Orders.AsNoTracking()
            .Where(order => order.EventId == ev.Id && order.Status == OrderStatus.Confirmed)
            .Select(order => new { order.Id, order.AttendeeId, order.AttendeeEmail })
            .ToListAsync();
        var summary = string.Join("; ", changes);
        foreach (var holder in holders)
        {
            notifications.Notify(holder.AttendeeId, "EventUpdated", $"Event updated: {ev.Title}",
                $"Details of {ev.Title} changed: {summary}.", ev.Id, holder.Id, email: holder.AttendeeEmail,
                emailBody: $"Details of {ev.Title} changed: {summary}.\n" +
                    $"Update your calendar entry: {notifications.AppUrl($"/api/events/{ev.Id}/calendar.ics")}");
        }
    }

    private static List<string> DescribeAttendeeFacingChanges(Event ev, CreateEventRequest request)
    {
        var changes = new List<string>();
        if (ev.StartDateUtc != request.StartDateUtc || ev.EndDateUtc != request.EndDateUtc)
        {
            changes.Add($"time {ev.StartDateUtc:yyyy-MM-dd HH:mm} → {request.StartDateUtc:yyyy-MM-dd HH:mm} UTC");
        }
        if (ev.Venue != request.Venue.Trim() || ev.City != request.City.Trim() ||
            (request.VenueAddress is not null && ev.VenueAddress != request.VenueAddress.Trim()))
        {
            changes.Add($"venue now {request.Venue.Trim()}, {request.City.Trim()}");
        }
        if (ev.Title != request.Title.Trim()) changes.Add($"title now '{request.Title.Trim()}'");
        return changes;
    }

    private static void Apply(Event ev, CreateEventRequest request)
    {
        ev.Title = request.Title.Trim();
        ev.Description = request.Description.Trim();
        ev.Venue = request.Venue.Trim();
        ev.City = request.City.Trim();
        if (request.VenueAddress is not null) ev.VenueAddress = request.VenueAddress.Trim();
        if (!string.IsNullOrWhiteSpace(request.Timezone)) ev.Timezone = request.Timezone.Trim();
        if (request.RefundPolicy is not null) ev.RefundPolicy = string.IsNullOrWhiteSpace(request.RefundPolicy) ? null : request.RefundPolicy.Trim();
        ev.Category = NormalizeCategory(request.Category);
        ev.ImageUrls = NormalizeImageUrls(request.ImageUrls);
        ev.StartDateUtc = request.StartDateUtc;
        ev.EndDateUtc = request.EndDateUtc;
        ev.IsPublished = request.IsPublished;
        ev.Visibility = request.Visibility;
        ev.RegistrationOpensAt = request.RegistrationOpensAt;
        ev.RegistrationClosesAt = request.RegistrationClosesAt;
        ev.Capacity = request.Capacity;
    }

    private static bool CanPublish(AppUser user) => user.EmailConfirmed || user.Role == UserRole.PlatformAdmin;

    private async Task<Event?> GetManagedEventAsync(Guid eventId, Guid organizerId, bool isPlatformAdmin) =>
        await db.Events.SingleOrDefaultAsync(candidate =>
            candidate.Id == eventId && (candidate.OrganizerId == organizerId || isPlatformAdmin));

    private static string? ValidateRequest(CreateEventRequest request)
    {
        var title = request.Title?.Trim() ?? string.Empty;
        if (title.Length is < 3 or > 120) return "Title must be between 3 and 120 characters.";

        var description = request.Description?.Trim() ?? string.Empty;
        if (description.Length is < 20 or > 4000) return "Description must be between 20 and 4000 characters.";

        var venue = request.Venue?.Trim() ?? string.Empty;
        if (venue.Length is < 1 or > 250) return "Venue is required and must be at most 250 characters.";

        var city = request.City?.Trim() ?? string.Empty;
        if (city.Length is < 1 or > 120) return "City is required and must be at most 120 characters.";

        if (request.VenueAddress?.Trim().Length > 300) return "Venue address must be at most 300 characters.";
        if (request.RefundPolicy?.Trim().Length > 2000) return "Refund policy must be at most 2000 characters.";
        if (!string.IsNullOrWhiteSpace(request.Timezone) &&
            (request.Timezone.Trim().Length > 64 || !TimeZoneInfo.TryFindSystemTimeZoneById(request.Timezone.Trim(), out _)))
        {
            return "Time zone must be a valid IANA time zone such as Asia/Almaty.";
        }

        if (request.StartDateUtc >= request.EndDateUtc) return "Event end date must be after the start date.";
        if (request.Capacity is < 1) return "Capacity must be at least 1 or left empty for unlimited.";
        if (request.Category?.Trim().Length > 120) return "Category must be at most 120 characters.";
        if (!Enum.IsDefined(request.Visibility)) return "Event visibility is invalid.";
        if (request.RegistrationOpensAt is not null && request.RegistrationClosesAt is not null &&
            request.RegistrationOpensAt >= request.RegistrationClosesAt)
        {
            return "Registration close must be after registration open.";
        }

        if (request.ImageUrls is { Length: > 10 } ||
            request.ImageUrls?.Any(url => !Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
                uri.Scheme is not ("http" or "https")) == true)
        {
            return "Provide at most 10 absolute HTTP or HTTPS image URLs.";
        }

        return null;
    }

    private static string? NormalizeCategory(string? category) =>
        string.IsNullOrWhiteSpace(category) ? null : category.Trim();

    private static string[] NormalizeImageUrls(string[]? imageUrls) =>
        imageUrls?.Select(url => url.Trim()).ToArray() ?? [];

    private static string GenerateSlug(string title)
    {
        var slug = new string(title.ToLowerInvariant()
            .Where(ch => char.IsLetterOrDigit(ch) || ch == ' ' || ch == '-')
            .ToArray());

        return string.Join('-', slug.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
    }

    private async Task<string> GenerateUniqueSlugAsync(string baseSlug, Guid? exceptEventId = null)
    {
        var candidate = baseSlug;
        var suffix = 1;

        while (await db.Events.AnyAsync(e => e.Slug == candidate && e.Id != exceptEventId))
        {
            candidate = $"{baseSlug}-{suffix}";
            suffix++;
        }

        return candidate;
    }
}
