using System.Data;
using System.Security.Cryptography;
using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using QRCoder;

namespace BiletFlow.Api.Services;

public sealed class TicketingService(AuthDbContext db, AuditService audit)
{
    /// <summary>How long inventory stays reserved for an unpaid order.</summary>
    public static readonly TimeSpan ReservationTime = TimeSpan.FromMinutes(15);

    public async Task<IReadOnlyList<TicketTypeResponse>?> GetTicketTypesAsync(Guid eventId, Guid? requesterId, bool isPlatformAdmin)
    {
        var ev = await db.Events.SingleOrDefaultAsync(candidate => candidate.Id == eventId);
        if (ev is null) return null;

        var canManage = isPlatformAdmin || requesterId == ev.OrganizerId;
        if (!ev.IsPublished && !canManage) return null;

        var ticketTypes = await db.TicketTypes
            .Where(ticketType => ticketType.EventId == eventId && (canManage || !ticketType.IsHidden))
            .OrderBy(ticketType => ticketType.Price)
            .ThenBy(ticketType => ticketType.Name)
            .ToListAsync();
        var counts = await GetStatusCountsAsync(eventId);
        return ticketTypes.Select(ticketType => ToTicketTypeResponse(ticketType, counts)).ToList();
    }

    public async Task<(TicketTypeResponse? TicketType, string? Error)> CreateTicketTypeAsync(
        Guid organizerId,
        bool isPlatformAdmin,
        Guid eventId,
        CreateTicketTypeRequest request)
    {
        var ev = await GetManagedEventAsync(eventId, organizerId, isPlatformAdmin);
        if (ev is null) return (null, "Event not found.");
        if (!IsValidSalesWindow(request.SalesStartAt, request.SalesEndAt)) return (null, "Sales end must be after sales start.");
        if (string.IsNullOrWhiteSpace(request.Name)) return (null, "Ticket type name is required.");

        var ticketType = new TicketType
        {
            EventId = eventId,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            Price = decimal.Round(request.Price, 2),
            Quantity = request.Quantity,
            SalesStartAt = request.SalesStartAt,
            SalesEndAt = request.SalesEndAt,
            MaxPerOrder = request.MaxPerOrder,
            IsHidden = request.IsHidden
        };
        db.TicketTypes.Add(ticketType);
        await db.SaveChangesAsync();
        return (ToTicketTypeResponse(ticketType, null), null);
    }

    public async Task<(TicketTypeResponse? TicketType, string? Error)> UpdateTicketTypeAsync(
        Guid organizerId,
        bool isPlatformAdmin,
        Guid eventId,
        Guid ticketTypeId,
        UpdateTicketTypeRequest request)
    {
        var ev = await GetManagedEventAsync(eventId, organizerId, isPlatformAdmin);
        if (ev is null) return (null, "Event not found.");

        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var ticketType = await db.TicketTypes.SingleOrDefaultAsync(candidate =>
                candidate.Id == ticketTypeId && candidate.EventId == eventId);
            if (ticketType is null) return (null, "Ticket type not found.");
            if (!IsValidSalesWindow(request.SalesStartAt, request.SalesEndAt)) return (null, "Sales end must be after sales start.");
            if (request.Quantity < ticketType.SoldQuantity + ticketType.ReservedQuantity)
            {
                return (null, "Quantity cannot be lower than the number of tickets already sold or reserved.");
            }

            if (string.IsNullOrWhiteSpace(request.Name)) return (null, "Ticket type name is required.");

            ticketType.Name = request.Name.Trim();
            ticketType.Description = request.Description?.Trim();
            ticketType.Price = decimal.Round(request.Price, 2);
            ticketType.Quantity = request.Quantity;
            ticketType.SalesStartAt = request.SalesStartAt;
            ticketType.SalesEndAt = request.SalesEndAt;
            ticketType.MaxPerOrder = request.MaxPerOrder;
            ticketType.IsHidden = request.IsHidden;
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return (ToTicketTypeResponse(ticketType, await GetStatusCountsAsync(eventId)), null);
        }
        catch (Exception exception) when (IsSerializationConflict(exception))
        {
            return (null, "Inventory changed while updating this ticket type. Please retry.");
        }
    }

    public async Task<bool> ActivatePaidSalesSimulationAsync(
        Guid organizerId,
        bool isPlatformAdmin,
        Guid eventId,
        bool confirmSimulationOnly)
    {
        if (!confirmSimulationOnly) return false;
        var ev = await GetManagedEventAsync(eventId, organizerId, isPlatformAdmin);
        if (ev is null || !await db.TicketTypes.AnyAsync(ticketType => ticketType.EventId == eventId && ticketType.Price > 0))
        {
            return false;
        }

        // Only a platform admin may lift a suspension.
        if (ev.PaidSalesStatus == PaidSalesStatus.Suspended && !isPlatformAdmin) return false;

        ev.PaidSalesStatus = PaidSalesStatus.Active;
        ev.PaidTermsAccepted = true;
        ev.UpdatedAt = DateTimeOffset.UtcNow;
        audit.Add(AuditActionType.PaidSalesActivated, nameof(Event), ev.Id, ev.Id, organizerId, "Paid sales activated (simulation).");
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<bool> SuspendPaidSalesAsync(Guid adminId, Guid eventId)
    {
        var ev = await db.Events.SingleOrDefaultAsync(candidate => candidate.Id == eventId);
        if (ev is null) return false;

        ev.PaidSalesStatus = PaidSalesStatus.Suspended;
        ev.UpdatedAt = DateTimeOffset.UtcNow;
        audit.Add(AuditActionType.PaidSalesSuspended, nameof(Event), ev.Id, ev.Id, adminId, "Paid sales suspended by a platform administrator.");
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<(OrderResponse? Order, string? Error, bool Conflict)> CheckoutAsync(Guid attendeeId, CheckoutRequest request)
    {
        if (request.EventId == Guid.Empty || request.Items.Count is < 1 or > 10)
        {
            return (null, "Select between 1 and 10 ticket types.", false);
        }

        if (request.Items.Any(item => item.TicketTypeId == Guid.Empty || item.Quantity < 1 || item.Quantity > 100) ||
            request.Items.Select(item => item.TicketTypeId).Distinct().Count() != request.Items.Count)
        {
            return (null, "Ticket selections must be valid and each ticket type may appear only once.", false);
        }

        if (string.IsNullOrWhiteSpace(request.AttendeeName) || string.IsNullOrWhiteSpace(request.AttendeeEmail))
        {
            return (null, "Attendee name and email are required.", false);
        }

        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var (ev, ticketTypes) = await LoadInventoryAsync(request.EventId);
            if (ev is null || !ev.IsPublished) return (null, "Published event not found.", false);

            var now = DateTimeOffset.UtcNow;
            if (ev.EndDateUtc <= now) return (null, "This event has already ended.", false);

            // Unpaid orders whose reservation ran out give their tickets back before we count what is left.
            await ReleaseExpiredOrdersAsync(ev, ticketTypes);

            if (request.Items.Any(item => !ticketTypes.ContainsKey(item.TicketTypeId)))
            {
                return (null, "One or more ticket types are unavailable.", false);
            }

            foreach (var selection in request.Items)
            {
                var ticketType = ticketTypes[selection.TicketTypeId];
                if (ticketType.IsHidden ||
                    (ticketType.SalesStartAt is not null && ticketType.SalesStartAt > now) ||
                    (ticketType.SalesEndAt is not null && ticketType.SalesEndAt <= now))
                {
                    return (null, $"Ticket type '{ticketType.Name}' is not currently on sale.", false);
                }

                if (selection.Quantity > ticketType.MaxPerOrder)
                {
                    return (null, $"Ticket type '{ticketType.Name}' exceeds its per-order limit.", false);
                }

                if (selection.Quantity > ticketType.Quantity - ticketType.SoldQuantity - ticketType.ReservedQuantity)
                {
                    return (null, $"Ticket type '{ticketType.Name}' has insufficient inventory.", true);
                }

                if (ticketType.Price > 0 && ev.PaidSalesStatus != PaidSalesStatus.Active)
                {
                    return (null, "Paid sales have not been activated for this event.", false);
                }
            }

            var totalQuantity = request.Items.Sum(selection => selection.Quantity);
            if (ev.Capacity is not null && totalQuantity > ev.Capacity.Value - ev.TicketsIssued - ev.TicketsReserved)
            {
                return (null, "The event does not have enough remaining capacity.", true);
            }

            var order = new Order
            {
                AttendeeId = attendeeId,
                EventId = ev.Id,
                AttendeeName = request.AttendeeName.Trim(),
                AttendeeEmail = request.AttendeeEmail.Trim().ToLowerInvariant(),
                Status = OrderStatus.Pending,
                Total = request.Items.Sum(selection => ticketTypes[selection.TicketTypeId].Price * selection.Quantity),
                CreatedAt = now
            };
            if (order.Total > 9_999_999_999.99m)
            {
                return (null, "Order total exceeds the supported KZT amount.", false);
            }

            foreach (var selection in request.Items)
            {
                var ticketType = ticketTypes[selection.TicketTypeId];
                for (var index = 0; index < selection.Quantity; index++)
                {
                    order.Items.Add(new OrderItem
                    {
                        Order = order,
                        TicketTypeId = ticketType.Id,
                        TicketTypeName = ticketType.Name,
                        UnitPrice = ticketType.Price
                    });
                }
            }

            AdjustCounters(ev, ticketTypes, order.Items, reservedSign: 1, soldSign: 0);
            db.Orders.Add(order);
            audit.Add(AuditActionType.OrderCreated, nameof(Order), order.Id, ev.Id, attendeeId,
                $"Order created: {totalQuantity} ticket(s), total {order.Total:0.00} KZT.");

            if (order.Total == 0)
            {
                ConfirmOrder(order, ev, ticketTypes);
            }

            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return (ToOrderResponse(order, ev.Title, order.Status == OrderStatus.Confirmed), null, false);
        }
        catch (Exception exception) when (IsSerializationConflict(exception))
        {
            return (null, "Inventory changed during checkout. Please retry.", true);
        }
    }

    /// <summary>Simulated payment of a pending order. Tickets are created only when the outcome is "succeeded".</summary>
    public async Task<(OrderResponse? Order, string? Error, ServiceError Kind)> PayOrderAsync(Guid orderId, Guid attendeeId, string? outcome)
    {
        var normalized = (outcome ?? "succeeded").Trim().ToLowerInvariant();
        if (normalized is not ("succeeded" or "failed"))
        {
            return (null, "Outcome must be 'succeeded' or 'failed'.", ServiceError.BadRequest);
        }

        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var order = await LoadOrderAsync(orderId);
            if (order is null || order.AttendeeId != attendeeId) return (null, "Order not found.", ServiceError.NotFound);
            if (order.Status != OrderStatus.Pending) return (null, "Only pending orders can be paid.", ServiceError.BadRequest);

            var now = DateTimeOffset.UtcNow;
            if (order.CreatedAt + ReservationTime <= now)
            {
                // Give the tickets back right away and keep that change; the buyer has to start a new order.
                var (expiredEvent, expiredTypes) = await LoadInventoryAsync(order.EventId);
                if (expiredEvent is not null)
                {
                    ReleasePendingOrder(order, expiredEvent, expiredTypes, null, AuditActionType.OrderExpired,
                        "Pending order expired after 15 minutes without payment.");
                    await db.SaveChangesAsync();
                    await transaction.CommitAsync();
                }

                return (null, "The reservation for this order has expired.", ServiceError.BadRequest);
            }

            var payment = new Payment
            {
                OrderId = order.Id,
                Amount = order.Total,
                IsSimulated = true,
                CreatedAt = now
            };
            db.Payments.Add(payment);

            Event ev;
            if (normalized == "succeeded")
            {
                var inventory = await LoadInventoryAsync(order.EventId);
                if (inventory.Event is null) return (null, "Order not found.", ServiceError.NotFound);
                ev = inventory.Event;

                payment.Status = PaymentStatus.Succeeded;
                ConfirmOrder(order, ev, inventory.Types);
                audit.Add(AuditActionType.PaymentSucceeded, nameof(Payment), payment.Id, ev.Id, attendeeId,
                    $"Simulated payment of {payment.Amount:0.00} KZT succeeded.");
            }
            else
            {
                ev = await db.Events.SingleAsync(candidate => candidate.Id == order.EventId);
                payment.Status = PaymentStatus.Failed;
                audit.Add(AuditActionType.PaymentFailed, nameof(Payment), payment.Id, ev.Id, attendeeId,
                    $"Simulated payment of {payment.Amount:0.00} KZT failed.");
            }

            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return (ToOrderResponse(order, ev.Title, order.Status == OrderStatus.Confirmed), null, ServiceError.None);
        }
        catch (Exception exception) when (IsSerializationConflict(exception))
        {
            return (null, "Order changed while paying. Please retry.", ServiceError.Conflict);
        }
    }

    /// <summary>Attendee cancels their own unpaid order and releases the reservation.</summary>
    public async Task<(OrderResponse? Order, string? Error, ServiceError Kind)> CancelOwnOrderAsync(Guid orderId, Guid attendeeId)
    {
        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var order = await LoadOrderAsync(orderId);
            if (order is null || order.AttendeeId != attendeeId) return (null, "Order not found.", ServiceError.NotFound);
            if (order.Status != OrderStatus.Pending) return (null, "Only pending orders can be cancelled.", ServiceError.BadRequest);

            var (ev, types) = await LoadInventoryAsync(order.EventId);
            if (ev is null) return (null, "Order not found.", ServiceError.NotFound);

            ReleasePendingOrder(order, ev, types, attendeeId, AuditActionType.OrderCancelled, "Pending order cancelled by the attendee.");
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return (ToOrderResponse(order, ev.Title, false), null, ServiceError.None);
        }
        catch (Exception exception) when (IsSerializationConflict(exception))
        {
            return (null, "Order changed while cancelling. Please retry.", ServiceError.Conflict);
        }
    }

    /// <summary>Organizer cancels a confirmed FREE order: its tickets are cancelled and the inventory is released.</summary>
    public async Task<(OrderResponse? Order, string? Error, ServiceError Kind)> CancelFreeOrderAsync(
        Guid eventId, Guid orderId, Guid actorId, bool isPlatformAdmin)
    {
        var canManage = await db.Events.AsNoTracking().AnyAsync(candidate =>
            candidate.Id == eventId && (candidate.OrganizerId == actorId || isPlatformAdmin));
        if (!canManage) return (null, "Event not found.", ServiceError.NotFound);

        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var order = await LoadOrderAsync(orderId);
            if (order is null || order.EventId != eventId) return (null, "Order not found.", ServiceError.NotFound);
            if (order.Status != OrderStatus.Confirmed) return (null, "Only confirmed orders can be cancelled.", ServiceError.BadRequest);
            if (order.Total > 0) return (null, "Only free orders can be cancelled.", ServiceError.BadRequest);

            var tickets = order.Items.Where(item => item.Ticket is not null).Select(item => item.Ticket!).ToList();
            if (tickets.Any(ticket => ticket.Status == TicketStatus.CheckedIn))
            {
                return (null, "The order has checked-in tickets.", ServiceError.BadRequest);
            }

            var (ev, types) = await LoadInventoryAsync(eventId);
            if (ev is null) return (null, "Event not found.", ServiceError.NotFound);

            foreach (var ticket in tickets) ticket.Status = TicketStatus.Cancelled;
            AdjustCounters(ev, types, order.Items, reservedSign: 0, soldSign: -1);
            order.Status = OrderStatus.Cancelled;
            audit.Add(AuditActionType.OrderCancelled, nameof(Order), order.Id, ev.Id, actorId, "Free order cancelled by the organizer.");

            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return (ToOrderResponse(order, ev.Title, false), null, ServiceError.None);
        }
        catch (Exception exception) when (IsSerializationConflict(exception))
        {
            return (null, "Order changed during this action. Please retry.", ServiceError.Conflict);
        }
    }

    public async Task<IReadOnlyList<AttendeeResponse>?> GetAttendeesAsync(Guid eventId, Guid requesterId, bool isPlatformAdmin, string? search)
    {
        var canManage = await db.Events.AsNoTracking().AnyAsync(candidate =>
            candidate.Id == eventId && (candidate.OrganizerId == requesterId || isPlatformAdmin));
        if (!canManage) return null;

        var query = db.Tickets.AsNoTracking().Where(ticket => ticket.EventId == eventId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(ticket => ticket.AttendeeName.ToLower().Contains(term) || ticket.AttendeeEmail.ToLower().Contains(term));
        }

        var rows = await query
            .OrderBy(ticket => ticket.AttendeeName)
            .ThenBy(ticket => ticket.Code)
            .Select(ticket => new
            {
                ticket.Id,
                ticket.OrderItem.OrderId,
                ticket.AttendeeName,
                ticket.AttendeeEmail,
                ticket.OrderItem.TicketTypeName,
                ticket.Status
            })
            .ToListAsync();
        return rows.Select(row => new AttendeeResponse(
            row.Id, row.OrderId, row.AttendeeName, row.AttendeeEmail, row.TicketTypeName, row.Status.ToString())).ToList();
    }

    public async Task<IReadOnlyList<OrderResponse>> GetAttendeeOrdersAsync(Guid attendeeId)
    {
        var orders = await LoadOrders()
            .Where(order => order.AttendeeId == attendeeId)
            .OrderByDescending(order => order.CreatedAt)
            .ToListAsync();
        return orders.Select(order => ToOrderResponse(order, order.Event.Title, false)).ToList();
    }

    public async Task<OrderResponse?> GetOrderAsync(Guid orderId, Guid requesterId, bool isPlatformAdmin)
    {
        var order = await LoadOrders().SingleOrDefaultAsync(candidate => candidate.Id == orderId);
        if (order is null || (order.AttendeeId != requesterId && order.Event.OrganizerId != requesterId && !isPlatformAdmin))
        {
            return null;
        }

        return ToOrderResponse(order, order.Event.Title, true);
    }

    public async Task<IReadOnlyList<OrderResponse>?> GetEventOrdersAsync(Guid eventId, Guid organizerId, bool isPlatformAdmin)
    {
        var ev = await GetManagedEventAsync(eventId, organizerId, isPlatformAdmin);
        if (ev is null) return null;
        var orders = await LoadOrders()
            .Where(order => order.EventId == eventId)
            .OrderByDescending(order => order.CreatedAt)
            .ToListAsync();
        return orders.Select(order => ToOrderResponse(order, ev.Title, false)).ToList();
    }

    public async Task<byte[]?> GetTicketQrAsync(Guid ticketId, Guid requesterId, bool isPlatformAdmin)
    {
        var ticket = await db.Tickets
            .Include(candidate => candidate.OrderItem)
            .ThenInclude(item => item.Order)
            .ThenInclude(order => order.Event)
            .SingleOrDefaultAsync(candidate => candidate.Id == ticketId);
        if (ticket is null) return null;
        if (ticket.Status is TicketStatus.Cancelled or TicketStatus.Refunded) return null;
        var order = ticket.OrderItem.Order;
        if (order.AttendeeId != requesterId && order.Event.OrganizerId != requesterId && !isPlatformAdmin)
        {
            return null;
        }

        return GenerateQr(ticket.Code);
    }

    private IQueryable<Order> LoadOrders() => db.Orders
        .Include(order => order.Event)
        .Include(order => order.Payments)
        .Include(order => order.Items)
            .ThenInclude(item => item.Ticket);

    /// <summary>Loads an order with its payments, items and tickets (without the event).</summary>
    private Task<Order?> LoadOrderAsync(Guid orderId) => db.Orders
        .Include(order => order.Payments)
        .Include(order => order.Items)
            .ThenInclude(item => item.Ticket)
        .SingleOrDefaultAsync(order => order.Id == orderId);

    /// <summary>Loads an event with all its ticket types. Callers run inside a Serializable transaction, which keeps concurrent updates consistent.</summary>
    private async Task<(Event? Event, Dictionary<Guid, TicketType> Types)> LoadInventoryAsync(Guid eventId)
    {
        var ev = await db.Events.SingleOrDefaultAsync(candidate => candidate.Id == eventId);
        if (ev is null) return (null, []);

        var types = await db.TicketTypes.Where(ticketType => ticketType.EventId == eventId).ToListAsync();
        return (ev, types.ToDictionary(ticketType => ticketType.Id));
    }

    /// <summary>Cancels this event's unpaid orders whose reservation time ran out, so their tickets become available again.</summary>
    private async Task ReleaseExpiredOrdersAsync(Event ev, Dictionary<Guid, TicketType> types)
    {
        var cutoff = DateTimeOffset.UtcNow - ReservationTime;
        var expiredOrders = await db.Orders
            .Include(order => order.Items)
            .Where(order => order.EventId == ev.Id && order.Status == OrderStatus.Pending && order.CreatedAt <= cutoff)
            .ToListAsync();
        foreach (var order in expiredOrders)
        {
            ReleasePendingOrder(order, ev, types, null, AuditActionType.OrderExpired, "Pending order expired after 15 minutes without payment.");
        }
    }

    /// <summary>Applies per-ticket counter changes to the ticket types and the event.</summary>
    private static void AdjustCounters(
        Event ev, Dictionary<Guid, TicketType> types, IEnumerable<OrderItem> items, int reservedSign, int soldSign)
    {
        foreach (var group in items.GroupBy(item => item.TicketTypeId))
        {
            var count = group.Count();
            types[group.Key].ReservedQuantity += reservedSign * count;
            types[group.Key].SoldQuantity += soldSign * count;
            ev.TicketsReserved += reservedSign * count;
            ev.TicketsIssued += soldSign * count;
        }

        ev.UpdatedAt = DateTimeOffset.UtcNow;
    }

    /// <summary>Marks the order confirmed, creates one ticket per item and moves reserved counters to sold/issued.</summary>
    private static void ConfirmOrder(Order order, Event ev, Dictionary<Guid, TicketType> types)
    {
        order.Status = OrderStatus.Confirmed;
        foreach (var item in order.Items)
        {
            item.Ticket = new Ticket
            {
                EventId = ev.Id,
                Code = CreateTicketCode(),
                AttendeeName = order.AttendeeName,
                AttendeeEmail = order.AttendeeEmail
            };
        }

        AdjustCounters(ev, types, order.Items, reservedSign: -1, soldSign: 1);
    }

    private void ReleasePendingOrder(
        Order order, Event ev, Dictionary<Guid, TicketType> types, Guid? actorId, AuditActionType action, string description)
    {
        order.Status = OrderStatus.Cancelled;
        AdjustCounters(ev, types, order.Items, reservedSign: -1, soldSign: 0);
        audit.Add(action, nameof(Order), order.Id, ev.Id, actorId, description);
    }

    private async Task<Event?> GetManagedEventAsync(Guid eventId, Guid requesterId, bool isPlatformAdmin)
    {
        var ev = await db.Events.SingleOrDefaultAsync(candidate => candidate.Id == eventId);
        return ev is not null && (ev.OrganizerId == requesterId || isPlatformAdmin) ? ev : null;
    }

    /// <summary>Refunded and checked-in ticket counts per ticket type, from one grouped query.</summary>
    private async Task<Dictionary<(Guid TicketTypeId, TicketStatus Status), int>> GetStatusCountsAsync(Guid eventId)
    {
        var rows = await db.Tickets
            .Where(ticket => ticket.EventId == eventId &&
                (ticket.Status == TicketStatus.Refunded || ticket.Status == TicketStatus.CheckedIn))
            .GroupBy(ticket => new { ticket.OrderItem.TicketTypeId, ticket.Status })
            .Select(group => new { group.Key.TicketTypeId, group.Key.Status, Count = group.Count() })
            .ToListAsync();
        return rows.ToDictionary(row => (row.TicketTypeId, row.Status), row => row.Count);
    }

    private static TicketTypeResponse ToTicketTypeResponse(
        TicketType ticketType, Dictionary<(Guid TicketTypeId, TicketStatus Status), int>? counts) => new(
        ticketType.Id,
        ticketType.EventId,
        ticketType.Name,
        ticketType.Description,
        ticketType.Price,
        ticketType.Quantity,
        ticketType.SoldQuantity,
        ticketType.Quantity - ticketType.SoldQuantity - ticketType.ReservedQuantity,
        ticketType.SalesStartAt,
        ticketType.SalesEndAt,
        ticketType.MaxPerOrder,
        ticketType.IsHidden,
        ticketType.ReservedQuantity,
        counts is not null && counts.TryGetValue((ticketType.Id, TicketStatus.Refunded), out var refunded) ? refunded : 0,
        counts is not null && counts.TryGetValue((ticketType.Id, TicketStatus.CheckedIn), out var checkedIn) ? checkedIn : 0);

    private static OrderResponse ToOrderResponse(Order order, string eventTitle, bool includeQr)
    {
        var latestPayment = order.Payments.OrderByDescending(payment => payment.CreatedAt).FirstOrDefault();
        return new OrderResponse(
            order.Id,
            order.EventId,
            eventTitle,
            order.Status.ToString(),
            order.Total == 0 ? "Free" : "Simulation",
            order.Total,
            order.CreatedAt,
            order.Items
                .GroupBy(item => item.TicketTypeId)
                .Select(group => new OrderItemResponse(
                    group.Key,
                    group.First().TicketTypeName,
                    group.Count(),
                    group.First().UnitPrice,
                    group
                        .Where(item => item.Ticket is not null)
                        .Select(item => new TicketResponse(
                            item.Ticket!.Id,
                            item.Ticket.Code,
                            item.Ticket.Status.ToString(),
                            item.Ticket.AttendeeName,
                            item.Ticket.AttendeeEmail,
                            item.TicketTypeName,
                            includeQr && item.Ticket.Status is TicketStatus.Valid or TicketStatus.CheckedIn
                                ? $"data:image/png;base64,{Convert.ToBase64String(GenerateQr(item.Ticket.Code))}"
                                : null))
                        .ToList()))
                .ToList(),
            order.DiscountTotal,
            order.FeeTotal,
            order.Status == OrderStatus.Pending ? order.CreatedAt + ReservationTime : null,
            latestPayment?.Status.ToString());
    }

    private static byte[] GenerateQr(string code)
    {
        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(code, QRCodeGenerator.ECCLevel.Q);
        var qrCode = new PngByteQRCode(data);
        return qrCode.GetGraphic(8);
    }

    private static string CreateTicketCode() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
        .TrimEnd('=')
        .Replace('+', '-')
        .Replace('/', '_');

    private static bool IsValidSalesWindow(DateTimeOffset? startAt, DateTimeOffset? endAt) =>
        startAt is null || endAt is null || endAt > startAt;

    private static bool IsSerializationConflict(Exception exception) =>
        exception is PostgresException { SqlState: PostgresErrorCodes.SerializationFailure or PostgresErrorCodes.UniqueViolation } ||
        (exception.InnerException is not null && IsSerializationConflict(exception.InnerException));
}
