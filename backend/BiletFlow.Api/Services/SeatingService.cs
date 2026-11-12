using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BiletFlow.Api.Services;

/// <summary>Assigned seating (SRS 4.3.1): predefined venue layouts, per-event section pricing, seat map and seat holds.</summary>
public sealed class SeatingService(AuthDbContext db, AuditService audit)
{
    /// <summary>Id of the predefined demonstration venue created at startup.</summary>
    public static readonly Guid DemoVenueId = Guid.Parse("6f1d0a52-3c1b-4f0e-9a51-1b7c2d9e0a01");

    private static readonly IReadOnlyDictionary<string, string> Legend = new Dictionary<string, string>
    {
        ["Available"] = "Available — can be selected",
        ["Selected"] = "Selected — chosen in this browser (client-side state)",
        ["Held"] = "Temporarily held — another checkout is in progress",
        ["Sold"] = "Sold — no longer available",
        ["Unavailable"] = "Unavailable — this section is not on sale",
        ["Accessible"] = "Accessible seat (wheelchair space) — shown in addition to the status"
    };

    /// <summary>Creates the predefined venue layout once: VIP, Parterre (with accessible seats) and Balcony.</summary>
    public async Task EnsureDemoVenueAsync()
    {
        if (await db.Venues.AnyAsync(venue => venue.Id == DemoVenueId)) return;

        var venue = new Venue { Id = DemoVenueId, Name = "BiletFlow Demo Hall", Address = "Abay Avenue 1, Almaty, Kazakhstan" };
        AddSection(venue, "VIP", ["A", "B"], 10, accessible: (_, _) => false);
        AddSection(venue, "Parterre", ["C", "D", "E", "F", "G", "H"], 14,
            accessible: (row, number) => row == "H" && number is 1 or 2 or 13 or 14);
        AddSection(venue, "Balcony", ["J", "K"], 12, accessible: (_, _) => false);
        db.Venues.Add(venue);
        await db.SaveChangesAsync();
    }

    public async Task<IReadOnlyList<VenueResponse>> GetVenuesAsync()
    {
        var venues = await db.Venues.AsNoTracking()
            .Include(venue => venue.Sections).ThenInclude(section => section.Seats)
            .OrderBy(venue => venue.Name)
            .ToListAsync();
        return venues.Select(venue => new VenueResponse(
            venue.Id, venue.Name, venue.Address, venue.Sections.Sum(section => section.Seats.Count),
            venue.Sections.OrderBy(section => section.Name).Select(section => new VenueSectionSummary(
                section.Id, section.Name, section.Seats.Count, section.Seats.Count(seat => seat.IsAccessible),
                section.Seats.Select(seat => seat.RowLabel).Distinct().Order().ToList())).ToList())).ToList();
    }

    /// <summary>Switches an event between general admission and an assigned-seating layout. Allowed only before any order exists.</summary>
    public async Task<(SeatMapResponse? SeatMap, string? Error, ServiceError Kind)> ConfigureAsync(
        Guid eventId, Guid actorId, bool isPlatformAdmin, ConfigureSeatingRequest request)
    {
        var ev = await db.Events.SingleOrDefaultAsync(candidate =>
            candidate.Id == eventId && (candidate.OrganizerId == actorId || isPlatformAdmin));
        if (ev is null) return (null, "Event not found.", ServiceError.NotFound);
        if (ev.IsCancelled) return (null, "A cancelled event cannot be changed.", ServiceError.BadRequest);
        if (!Enum.TryParse<SeatingMode>(request.SeatingMode, true, out var mode) || !Enum.IsDefined(mode))
        {
            return (null, "Seating mode must be General or Assigned.", ServiceError.BadRequest);
        }
        if (await db.Orders.AnyAsync(order => order.EventId == eventId))
        {
            return (null, "Seating cannot be changed after orders exist for the event.", ServiceError.Conflict);
        }

        var existingLinks = await db.TicketTypeSections.Where(link => link.EventId == eventId).ToListAsync();
        db.TicketTypeSections.RemoveRange(existingLinks);

        if (mode == SeatingMode.General)
        {
            ev.SeatingMode = SeatingMode.General;
            ev.VenueId = null;
        }
        else
        {
            if (request.VenueId is null) return (null, "Select a predefined venue layout.", ServiceError.BadRequest);
            var venue = await db.Venues.Include(candidate => candidate.Sections).ThenInclude(section => section.Seats)
                .SingleOrDefaultAsync(candidate => candidate.Id == request.VenueId);
            if (venue is null) return (null, "Venue layout not found.", ServiceError.BadRequest);
            if (request.Sections.Count == 0) return (null, "Assign a ticket type to at least one section.", ServiceError.BadRequest);
            if (request.Sections.Select(row => row.SectionId).Distinct().Count() != request.Sections.Count)
            {
                return (null, "Each section can be assigned to only one ticket type.", ServiceError.BadRequest);
            }

            var sections = venue.Sections.ToDictionary(section => section.Id);
            var ticketTypes = await db.TicketTypes.Where(ticketType => ticketType.EventId == eventId)
                .ToDictionaryAsync(ticketType => ticketType.Id);
            if (request.Sections.Any(row => !sections.ContainsKey(row.SectionId)))
            {
                return (null, "Every section must belong to the selected venue.", ServiceError.BadRequest);
            }
            if (request.Sections.Any(row => !ticketTypes.ContainsKey(row.TicketTypeId)))
            {
                return (null, "Every ticket type must belong to this event.", ServiceError.BadRequest);
            }

            foreach (var row in request.Sections)
            {
                db.TicketTypeSections.Add(new TicketTypeSection
                {
                    EventId = eventId, SectionId = row.SectionId, TicketTypeId = row.TicketTypeId
                });
            }

            // A seated ticket type sells exactly the seats of its sections.
            foreach (var group in request.Sections.GroupBy(row => row.TicketTypeId))
            {
                ticketTypes[group.Key].Quantity = group.Sum(row => sections[row.SectionId].Seats.Count);
            }

            ev.SeatingMode = SeatingMode.Assigned;
            ev.VenueId = venue.Id;
            if (string.IsNullOrWhiteSpace(ev.VenueAddress)) ev.VenueAddress = venue.Address;
        }

        ev.UpdatedAt = DateTimeOffset.UtcNow;
        audit.Add(AuditActionType.SeatingConfigured, nameof(Event), ev.Id, ev.Id, actorId,
            mode == SeatingMode.General ? "Event switched to general admission." : "Assigned-seating layout configured.");
        await db.SaveChangesAsync();
        return (await BuildSeatMapAsync(ev), null, ServiceError.None);
    }

    public async Task<SeatMapResponse?> GetSeatMapAsync(Guid eventId, Guid? requesterId, bool isPlatformAdmin)
    {
        var ev = await db.Events.AsNoTracking().SingleOrDefaultAsync(candidate => candidate.Id == eventId);
        if (ev is null) return null;
        var canManage = isPlatformAdmin || requesterId == ev.OrganizerId;
        if (!canManage && (!ev.IsPublished || ev.IsCancelled || ev.IsSuspended || ev.Visibility == EventVisibility.Private))
        {
            return null;
        }

        return await BuildSeatMapAsync(ev);
    }

    /// <summary>
    /// Holds the chosen seats for <paramref name="order"/> inside the caller's serializable transaction and adds one
    /// order item per seat. The unique (EventId, SeatId) indexes on holds and live tickets make double-selling impossible
    /// even when two checkouts race.
    /// </summary>
    public async Task<(string? Error, bool Conflict)> HoldSeatsAsync(
        Event ev, Dictionary<Guid, TicketType> ticketTypes, IReadOnlyList<Guid> seatIds, Order order, DateTimeOffset now)
    {
        if (ev.SeatingMode != SeatingMode.Assigned || ev.VenueId is null)
        {
            return ("This event does not use assigned seating.", false);
        }
        if (seatIds.Count is < 1 or > 10 || seatIds.Distinct().Count() != seatIds.Count)
        {
            return ("Select between 1 and 10 different seats.", false);
        }

        var seats = await db.Seats.Include(seat => seat.Section)
            .Where(seat => seatIds.Contains(seat.Id) && seat.Section.VenueId == ev.VenueId)
            .ToListAsync();
        if (seats.Count != seatIds.Count) return ("One or more seats do not exist in this venue.", false);

        var links = await db.TicketTypeSections.Where(link => link.EventId == ev.Id)
            .ToDictionaryAsync(link => link.SectionId, link => link.TicketTypeId);
        foreach (var seat in seats)
        {
            if (!links.TryGetValue(seat.SectionId, out var ticketTypeId) || !ticketTypes.ContainsKey(ticketTypeId))
            {
                return ($"Seat {Label(seat)} is not on sale.", false);
            }
        }

        if (await db.Tickets.AnyAsync(ticket => ticket.EventId == ev.Id && ticket.SeatId != null &&
                seatIds.Contains(ticket.SeatId.Value) &&
                ticket.Status != TicketStatus.Cancelled && ticket.Status != TicketStatus.Refunded))
        {
            return ("One or more selected seats have already been sold.", true);
        }

        // Holds that expired or whose order is no longer pending are released before new holds are placed.
        var holds = await db.SeatHolds.Include(hold => hold.Order)
            .Where(hold => hold.EventId == ev.Id && seatIds.Contains(hold.SeatId))
            .ToListAsync();
        var stale = holds.Where(hold => hold.ExpiresAt <= now || hold.Order.Status != OrderStatus.Pending).ToList();
        db.SeatHolds.RemoveRange(stale);
        if (holds.Count > stale.Count) return ("One or more selected seats are temporarily held by another checkout.", true);

        foreach (var seat in seats.OrderBy(seat => seat.Section.Name).ThenBy(seat => seat.RowLabel).ThenBy(seat => seat.Number))
        {
            var ticketType = ticketTypes[links[seat.SectionId]];
            order.Items.Add(new OrderItem
            {
                Order = order,
                TicketTypeId = ticketType.Id,
                TicketTypeName = ticketType.Name,
                UnitPrice = ticketType.Price,
                SeatId = seat.Id,
                Seat = seat
            });
            db.SeatHolds.Add(new SeatHold
            {
                EventId = ev.Id, SeatId = seat.Id, OrderId = order.Id, ExpiresAt = now + TicketingService.ReservationTime
            });
        }

        return (null, false);
    }

    /// <summary>Releases the holds of an order (both saved ones and ones added in the current unit of work).</summary>
    public async Task ReleaseHoldsAsync(Guid orderId)
    {
        foreach (var pending in db.SeatHolds.Local.Where(hold => hold.OrderId == orderId).ToList())
        {
            db.SeatHolds.Remove(pending);
        }

        var saved = await db.SeatHolds.Where(hold => hold.OrderId == orderId).ToListAsync();
        db.SeatHolds.RemoveRange(saved);
    }

    /// <summary>Maps seat ids to their ticket type for a quote, without placing holds.</summary>
    public async Task<(List<(Guid TicketTypeId, Guid SeatId)>? Seats, string? Error)> ResolveSeatTicketTypesAsync(
        Event ev, IReadOnlyList<Guid> seatIds)
    {
        if (ev.SeatingMode != SeatingMode.Assigned || ev.VenueId is null) return (null, "This event does not use assigned seating.");
        if (seatIds.Count is < 1 or > 10 || seatIds.Distinct().Count() != seatIds.Count) return (null, "Select between 1 and 10 different seats.");

        var seats = await db.Seats.AsNoTracking().Include(seat => seat.Section)
            .Where(seat => seatIds.Contains(seat.Id) && seat.Section.VenueId == ev.VenueId)
            .ToListAsync();
        if (seats.Count != seatIds.Count) return (null, "One or more seats do not exist in this venue.");
        var links = await db.TicketTypeSections.AsNoTracking().Where(link => link.EventId == ev.Id)
            .ToDictionaryAsync(link => link.SectionId, link => link.TicketTypeId);
        var result = new List<(Guid, Guid)>();
        foreach (var seat in seats)
        {
            if (!links.TryGetValue(seat.SectionId, out var ticketTypeId)) return (null, $"Seat {Label(seat)} is not on sale.");
            result.Add((ticketTypeId, seat.Id));
        }

        return (result, null);
    }

    public static string Label(Seat seat) => $"{seat.Section.Name}, Row {seat.RowLabel}, Seat {seat.Number}";

    private async Task<SeatMapResponse> BuildSeatMapAsync(Event ev)
    {
        if (ev.SeatingMode != SeatingMode.Assigned || ev.VenueId is null)
        {
            return new SeatMapResponse(ev.Id, ev.SeatingMode.ToString(), null, null,
                (int)TicketingService.ReservationTime.TotalMinutes, [], Legend);
        }

        var now = DateTimeOffset.UtcNow;
        var venue = await db.Venues.AsNoTracking()
            .Include(candidate => candidate.Sections).ThenInclude(section => section.Seats)
            .SingleAsync(candidate => candidate.Id == ev.VenueId);
        var links = await db.TicketTypeSections.AsNoTracking().Where(link => link.EventId == ev.Id)
            .ToDictionaryAsync(link => link.SectionId, link => link.TicketTypeId);
        var ticketTypes = await db.TicketTypes.AsNoTracking().Where(ticketType => ticketType.EventId == ev.Id)
            .ToDictionaryAsync(ticketType => ticketType.Id);
        var sold = (await db.Tickets.AsNoTracking()
                .Where(ticket => ticket.EventId == ev.Id && ticket.SeatId != null &&
                    ticket.Status != TicketStatus.Cancelled && ticket.Status != TicketStatus.Refunded)
                .Select(ticket => ticket.SeatId!.Value).ToListAsync())
            .ToHashSet();
        var held = (await db.SeatHolds.AsNoTracking()
                .Where(hold => hold.EventId == ev.Id && hold.ExpiresAt > now && hold.Order.Status == OrderStatus.Pending)
                .Select(hold => hold.SeatId).ToListAsync())
            .ToHashSet();

        var sections = venue.Sections.OrderBy(section => section.Name).Select(section =>
        {
            TicketType? ticketType = links.TryGetValue(section.Id, out var ticketTypeId) &&
                ticketTypes.TryGetValue(ticketTypeId, out var mapped) ? mapped : null;
            var onSale = ticketType is not null && !ticketType.IsHidden &&
                (ticketType.SalesStartAt is null || ticketType.SalesStartAt <= now) &&
                (ticketType.SalesEndAt is null || ticketType.SalesEndAt > now);
            var seats = section.Seats
                .OrderBy(seat => seat.RowLabel)
                .ThenBy(seat => int.TryParse(seat.Number, out var number) ? number : int.MaxValue)
                .Select(seat =>
                {
                    var status = sold.Contains(seat.Id) ? "Sold"
                        : held.Contains(seat.Id) ? "Held"
                        : onSale ? "Available" : "Unavailable";
                    var label = $"{section.Name}, Row {seat.RowLabel}, Seat {seat.Number}: {status}" +
                        (seat.IsAccessible ? ", accessible seat" : string.Empty) +
                        (ticketType is not null ? $", {ticketType.Price:0.##} KZT" : string.Empty);
                    return new SeatMapSeat(seat.Id, seat.RowLabel, seat.Number, seat.IsAccessible, status, label);
                }).ToList();
            return new SeatMapSection(section.Id, section.Name, ticketType?.Id, ticketType?.Name, ticketType?.Price, seats);
        }).ToList();

        return new SeatMapResponse(ev.Id, ev.SeatingMode.ToString(), venue.Id, venue.Name,
            (int)TicketingService.ReservationTime.TotalMinutes, sections, Legend);
    }

    private static void AddSection(Venue venue, string name, string[] rows, int seatsPerRow, Func<string, int, bool> accessible)
    {
        var section = new VenueSection { VenueId = venue.Id, Name = name };
        foreach (var row in rows)
        {
            for (var number = 1; number <= seatsPerRow; number++)
            {
                section.Seats.Add(new Seat
                {
                    SectionId = section.Id, RowLabel = row, Number = number.ToString(), IsAccessible = accessible(row, number)
                });
            }
        }

        venue.Sections.Add(section);
    }
}
