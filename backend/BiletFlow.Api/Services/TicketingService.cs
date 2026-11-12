using System.Data;
using System.Security.Cryptography;
using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using QRCoder;

namespace BiletFlow.Api.Services;

public sealed class TicketingService(
    AuthDbContext db,
    AuditService audit,
    PromoCampaignService promoCampaigns,
    SeatingService seating,
    PlatformSettingsService platformSettings,
    NotificationService notifications)
{
    /// <summary>How long inventory stays reserved for an unpaid order.</summary>
    public static readonly TimeSpan ReservationTime = TimeSpan.FromMinutes(15);

    public async Task<IReadOnlyList<TicketTypeResponse>?> GetTicketTypesAsync(Guid eventId, Guid? requesterId, bool isPlatformAdmin)
    {
        var ev = await db.Events.SingleOrDefaultAsync(candidate => candidate.Id == eventId);
        if (ev is null) return null;

        var canManage = isPlatformAdmin || requesterId == ev.OrganizerId;
        if ((!ev.IsPublished || ev.IsCancelled || ev.IsSuspended || ev.Visibility == EventVisibility.Private) && !canManage)
        {
            return null;
        }

        var ticketTypes = await db.TicketTypes
            .Where(ticketType => ticketType.EventId == eventId && (canManage || !ticketType.IsHidden))
            .OrderBy(ticketType => ticketType.Price)
            .ThenBy(ticketType => ticketType.Name)
            .ToListAsync();
        var counts = await GetStatusCountsAsync(eventId);
        return ticketTypes.Select(ticketType => ToTicketTypeResponse(ticketType, counts)).ToList();
    }

    public async Task<TicketTypeResponse?> GetTicketTypeAsync(
        Guid eventId, Guid ticketTypeId, Guid? requesterId, bool isPlatformAdmin)
    {
        var ev = await db.Events.SingleOrDefaultAsync(candidate => candidate.Id == eventId);
        if (ev is null || ev.IsCancelled) return null;

        var canManage = isPlatformAdmin || requesterId == ev.OrganizerId;
        if ((!ev.IsPublished || ev.IsSuspended || ev.Visibility == EventVisibility.Private) && !canManage) return null;

        var ticketType = await db.TicketTypes.SingleOrDefaultAsync(candidate =>
            candidate.Id == ticketTypeId && candidate.EventId == eventId && (canManage || !candidate.IsHidden));
        return ticketType is null
            ? null
            : ToTicketTypeResponse(ticketType, await GetStatusCountsAsync(eventId));
    }

    public async Task<(TicketTypeResponse? TicketType, string? Error)> CreateTicketTypeAsync(
        Guid organizerId,
        bool isPlatformAdmin,
        Guid eventId,
        CreateTicketTypeRequest request)
    {
        var ev = await GetManagedEventAsync(eventId, organizerId, isPlatformAdmin);
        if (ev is null) return (null, "Event not found.");
        if (ev.IsCancelled) return (null, "Ticket types cannot be changed after an event is cancelled.");
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
        audit.Add(AuditActionType.TicketTypeCreated, nameof(TicketType), ticketType.Id, eventId, organizerId,
            $"Ticket type '{ticketType.Name}' created: {ticketType.Price:0.00} KZT, quantity {ticketType.Quantity}.");
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
        if (ev.IsCancelled) return (null, "Ticket types cannot be changed after an event is cancelled.");

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
            if (ev.SeatingMode == SeatingMode.Assigned && request.Quantity != ticketType.Quantity &&
                await db.TicketTypeSections.AnyAsync(link => link.TicketTypeId == ticketTypeId))
            {
                return (null, "The quantity of a seated ticket type equals its seats; change the seating layout instead.");
            }

            var changes = DescribeTicketTypeChanges(ticketType, request);
            ticketType.Name = request.Name.Trim();
            ticketType.Description = request.Description?.Trim();
            ticketType.Price = decimal.Round(request.Price, 2);
            ticketType.Quantity = request.Quantity;
            ticketType.SalesStartAt = request.SalesStartAt;
            ticketType.SalesEndAt = request.SalesEndAt;
            ticketType.MaxPerOrder = request.MaxPerOrder;
            ticketType.IsHidden = request.IsHidden;
            audit.Add(AuditActionType.TicketTypeUpdated, nameof(TicketType), ticketType.Id, eventId, organizerId,
                $"Ticket type '{ticketType.Name}' updated{changes}.");
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return (ToTicketTypeResponse(ticketType, await GetStatusCountsAsync(eventId)), null);
        }
        catch (Exception exception) when (IsSerializationConflict(exception))
        {
            return (null, "Inventory changed while updating this ticket type. Please retry.");
        }
    }

    public async Task<(bool Deleted, string? Error)> DeleteTicketTypeAsync(
        Guid organizerId, bool isPlatformAdmin, Guid eventId, Guid ticketTypeId)
    {
        var ev = await GetManagedEventAsync(eventId, organizerId, isPlatformAdmin);
        if (ev is null) return (false, "Event not found.");

        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var ticketType = await db.TicketTypes.SingleOrDefaultAsync(candidate =>
                candidate.Id == ticketTypeId && candidate.EventId == eventId);
            if (ticketType is null) return (false, "Ticket type not found.");
            if (ticketType.SoldQuantity > 0 || ticketType.ReservedQuantity > 0 ||
                await db.OrderItems.AnyAsync(item => item.TicketTypeId == ticketTypeId))
            {
                return (false, "A ticket type with order, sale, or reservation history cannot be deleted. Hide it instead.");
            }
            if (await db.PromoCampaignTicketTypes.AnyAsync(row => row.TicketTypeId == ticketTypeId))
            {
                return (false, "Remove this ticket type from its promo campaigns before deleting it.");
            }

            db.TicketTypes.Remove(ticketType);
            audit.Add(AuditActionType.TicketTypeDeleted, nameof(TicketType), ticketType.Id, eventId, organizerId,
                $"Unused ticket type '{ticketType.Name}' deleted.");
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return (true, null);
        }
        catch (Exception exception) when (IsSerializationConflict(exception))
        {
            return (false, "Inventory changed while deleting this ticket type. Please retry.");
        }
    }

    public async Task<(OrderResponse? Order, string? Error, bool Conflict)> CheckoutAsync(Guid attendeeId, CheckoutRequest request)
    {
        var seatIds = request.SeatIds ?? [];
        if (request.EventId == Guid.Empty) return (null, "An event is required.", false);
        if (seatIds.Count == 0)
        {
            var selectionError = ValidateSelections(request.Items);
            if (selectionError is not null) return (null, selectionError, false);
        }

        if (string.IsNullOrWhiteSpace(request.AttendeeName) || string.IsNullOrWhiteSpace(request.AttendeeEmail))
        {
            return (null, "Attendee name and email are required.", false);
        }

        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var (ev, ticketTypes) = await LoadInventoryAsync(request.EventId);
            if (ev is null || !ev.IsPublished || ev.IsCancelled || ev.Visibility == EventVisibility.Private)
            {
                return (null, "Published event not found.", false);
            }

            if (ev.IsSuspended) return (null, "Sales for this event have been suspended by the platform.", false);

            var now = DateTimeOffset.UtcNow;
            var windowError = ValidateRegistrationWindow(ev, now);
            if (windowError is not null) return (null, windowError, false);

            // Unpaid orders whose reservation ran out give their tickets back before we count what is left.
            await ReleaseExpiredOrdersAsync(ev, ticketTypes);

            var order = new Order
            {
                AttendeeId = attendeeId,
                EventId = ev.Id,
                AttendeeName = request.AttendeeName.Trim(),
                AttendeeEmail = request.AttendeeEmail.Trim().ToLowerInvariant(),
                Status = OrderStatus.Pending,
                CreatedAt = now
            };

            if (ev.SeatingMode == SeatingMode.Assigned)
            {
                if (seatIds.Count == 0) return (null, "This event uses assigned seating. Select seats on the seat map.", false);
                var (seatError, seatConflict) = await seating.HoldSeatsAsync(ev, ticketTypes, seatIds, order, now);
                if (seatError is not null) return (null, seatError, seatConflict);
            }
            else
            {
                if (seatIds.Count > 0) return (null, "This event uses general admission; seats cannot be selected.", false);
                if (request.Items.Any(item => !ticketTypes.ContainsKey(item.TicketTypeId)))
                {
                    return (null, "One or more ticket types are unavailable.", false);
                }

                AddItems(order, request.Items, ticketTypes);
            }

            var (inventoryError, inventoryConflict) = ValidateInventory(ev, ticketTypes, order.Items, now);
            if (inventoryError is not null) return (null, inventoryError, inventoryConflict);

            var (campaign, promoError) = await promoCampaigns.FindApplicableCampaignAsync(
                ev.Id, request.PromoCode, request.CampaignToken,
                order.Items.Select(item => item.TicketTypeId).Distinct().ToArray(), null, now);
            if (promoError is not null) return (null, promoError, false);

            order.Total = order.Items.Sum(item => item.UnitPrice);
            if (order.Total > 9_999_999_999.99m) return (null, "Order total exceeds the supported KZT amount.", false);
            if (campaign is not null) await ApplyCampaignAsync(order, campaign);

            AdjustCounters(ev, ticketTypes, order.Items, reservedSign: 1, soldSign: 0);
            db.Orders.Add(order);
            audit.Add(AuditActionType.OrderCreated, nameof(Order), order.Id, ev.Id, attendeeId,
                $"Order created: {order.Items.Count} ticket(s), total {order.Total:0.00} KZT.");

            if (order.Total == 0)
            {
                await ConfirmOrderAsync(order, ev, ticketTypes, now);
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

    /// <summary>Prices a selection (and an optional promo code) without reserving anything, so the attendee sees the discount first.</summary>
    public async Task<(CheckoutQuoteResponse? Quote, string? Error)> QuoteAsync(CheckoutQuoteRequest request)
    {
        var ev = await db.Events.AsNoTracking().SingleOrDefaultAsync(candidate => candidate.Id == request.EventId);
        if (ev is null || !ev.IsPublished || ev.IsCancelled || ev.IsSuspended || ev.Visibility == EventVisibility.Private)
        {
            return (null, "Published event not found.");
        }

        var ticketTypes = await db.TicketTypes.AsNoTracking().Where(ticketType => ticketType.EventId == ev.Id)
            .ToDictionaryAsync(ticketType => ticketType.Id);
        var items = new List<OrderItem>();
        if (request.SeatIds is { Count: > 0 })
        {
            var (seats, seatError) = await seating.ResolveSeatTicketTypesAsync(ev, request.SeatIds);
            if (seatError is not null) return (null, seatError);
            items.AddRange(seats!.Select(seat => new OrderItem
            {
                TicketTypeId = seat.TicketTypeId,
                TicketTypeName = ticketTypes[seat.TicketTypeId].Name,
                UnitPrice = ticketTypes[seat.TicketTypeId].Price,
                SeatId = seat.SeatId
            }));
        }
        else
        {
            var selectionError = ValidateSelections(request.Items);
            if (selectionError is not null) return (null, selectionError);
            if (request.Items.Any(item => !ticketTypes.TryGetValue(item.TicketTypeId, out var type) || type.IsHidden))
            {
                return (null, "One or more ticket types are unavailable.");
            }

            var order = new Order { AttendeeName = "-", AttendeeEmail = "-" };
            AddItems(order, request.Items, ticketTypes);
            items.AddRange(order.Items);
        }

        var subtotal = items.Sum(item => item.UnitPrice);
        var (campaign, promoError) = await promoCampaigns.FindApplicableCampaignAsync(
            ev.Id, request.PromoCode, request.CampaignToken, items.Select(item => item.TicketTypeId).Distinct().ToArray(),
            null, DateTimeOffset.UtcNow);
        var discount = campaign is null ? 0m : await promoCampaigns.ApplyDiscountAsync(campaign, items) ?? 0m;
        return (new CheckoutQuoteResponse(ev.Id, subtotal, discount, subtotal - discount, "KZT", campaign?.Code,
            promoError, IsSimulated: true), null);
    }

    public async Task<(OrderResponse? Order, string? Error, ServiceError Kind)> UpdatePendingOrderAsync(
        Guid orderId, Guid attendeeId, UpdateOrderRequest request)
    {
        var selectionError = ValidateSelections(request.Items);
        if (selectionError is not null) return (null, selectionError, ServiceError.BadRequest);

        if (string.IsNullOrWhiteSpace(request.AttendeeName) || string.IsNullOrWhiteSpace(request.AttendeeEmail))
        {
            return (null, "Attendee name and email are required.", ServiceError.BadRequest);
        }

        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var order = await LoadOrderAsync(orderId);
            if (order is null || order.AttendeeId != attendeeId)
            {
                return (null, "Order not found.", ServiceError.NotFound);
            }

            if (order.Status != OrderStatus.Pending)
            {
                return (null, "Only pending orders can be updated.", ServiceError.BadRequest);
            }

            var (ev, ticketTypes) = await LoadInventoryAsync(order.EventId);
            if (ev is null) return (null, "Event not found.", ServiceError.NotFound);
            if (!ev.IsPublished || ev.IsCancelled || ev.IsSuspended || ev.Visibility == EventVisibility.Private)
            {
                return (null, "This event is not available for checkout.", ServiceError.BadRequest);
            }

            if (ev.SeatingMode == SeatingMode.Assigned)
            {
                return (null, "Seat selections cannot be edited. Cancel this order and choose seats again.", ServiceError.BadRequest);
            }

            var now = DateTimeOffset.UtcNow;
            if (order.CreatedAt + ReservationTime <= now)
            {
                await ReleasePendingOrderAsync(order, ev, ticketTypes, null, AuditActionType.OrderExpired,
                    "Pending order expired after 15 minutes without payment.");
                await db.SaveChangesAsync();
                await transaction.CommitAsync();
                return (null, "The reservation for this order has expired.", ServiceError.BadRequest);
            }

            var windowError = ValidateRegistrationWindow(ev, now);
            if (windowError is not null) return (null, windowError, ServiceError.BadRequest);

            AdjustCounters(ev, ticketTypes, order.Items, reservedSign: -1, soldSign: 0);
            if (request.Items.Any(item => !ticketTypes.ContainsKey(item.TicketTypeId)))
            {
                return (null, "One or more ticket types are unavailable.", ServiceError.BadRequest);
            }

            var replacement = new Order { Id = order.Id, AttendeeName = order.AttendeeName, AttendeeEmail = order.AttendeeEmail };
            AddItems(replacement, request.Items, ticketTypes);
            var (inventoryError, inventoryConflict) = ValidateInventory(ev, ticketTypes, replacement.Items, now);
            if (inventoryError is not null)
            {
                return (null, inventoryError, inventoryConflict ? ServiceError.Conflict : ServiceError.BadRequest);
            }

            var (campaign, promoError) = await promoCampaigns.FindApplicableCampaignAsync(
                ev.Id, request.PromoCode, request.CampaignToken,
                replacement.Items.Select(item => item.TicketTypeId).Distinct().ToArray(), order.Id, now);
            if (promoError is not null) return (null, promoError, ServiceError.BadRequest);

            db.OrderItems.RemoveRange(order.Items);
            order.Items.Clear();
            foreach (var item in replacement.Items)
            {
                item.Order = order;
                item.OrderId = order.Id;
                order.Items.Add(item);
                db.OrderItems.Add(item);
            }

            order.AttendeeName = request.AttendeeName.Trim();
            order.AttendeeEmail = request.AttendeeEmail.Trim().ToLowerInvariant();
            order.Total = order.Items.Sum(item => item.UnitPrice);
            order.DiscountTotal = 0m;
            order.PromoCampaignId = null;
            order.PromoCode = null;
            if (order.Total > 9_999_999_999.99m)
            {
                return (null, "Order total exceeds the supported KZT amount.", ServiceError.BadRequest);
            }

            if (campaign is not null) await ApplyCampaignAsync(order, campaign);

            AdjustCounters(ev, ticketTypes, order.Items, reservedSign: 1, soldSign: 0);
            audit.Add(AuditActionType.OrderUpdated, nameof(Order), order.Id, ev.Id, attendeeId,
                $"Pending order updated: {order.Items.Count} ticket(s), total {order.Total:0.00} KZT.");
            if (order.Total == 0) await ConfirmOrderAsync(order, ev, ticketTypes, now);

            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return (ToOrderResponse(order, ev.Title, order.Status == OrderStatus.Confirmed), null, ServiceError.None);
        }
        catch (Exception exception) when (IsSerializationConflict(exception))
        {
            return (null, "Inventory changed while updating this order. Please retry.", ServiceError.Conflict);
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

            var (ev, inventory) = await LoadInventoryAsync(order.EventId);
            if (ev is null) return (null, "Order not found.", ServiceError.NotFound);

            var now = DateTimeOffset.UtcNow;
            if (order.CreatedAt + ReservationTime <= now)
            {
                // Give the tickets back right away and keep that change; the buyer has to start a new order.
                await ReleasePendingOrderAsync(order, ev, inventory, null, AuditActionType.OrderExpired,
                    "Pending order expired after 15 minutes without payment.");
                await db.SaveChangesAsync();
                await transaction.CommitAsync();
                return (null, "The reservation for this order has expired.", ServiceError.BadRequest);
            }

            if (ev.IsCancelled)
            {
                await ReleasePendingOrderAsync(order, ev, inventory, null, AuditActionType.OrderCancelled,
                    "Pending order cancelled because its event was cancelled.");
                await db.SaveChangesAsync();
                await transaction.CommitAsync();
                return (null, "The event has been cancelled.", ServiceError.BadRequest);
            }

            if (ev.IsSuspended || ev.PaidSalesStatus != PaidSalesStatus.Active)
            {
                return (null, "Paid sales for this event are currently suspended.", ServiceError.BadRequest);
            }

            var payment = new Payment
            {
                OrderId = order.Id,
                Amount = order.Total,
                IsSimulated = true,
                CreatedAt = now
            };
            db.Payments.Add(payment);

            if (normalized == "succeeded")
            {
                payment.Status = PaymentStatus.Succeeded;
                order.FeeTotal = PlatformSettingsService.CalculateProcessingFee(await platformSettings.GetAsync(), order.Total);
                await ConfirmOrderAsync(order, ev, inventory, now);
                audit.Add(AuditActionType.PaymentSucceeded, nameof(Payment), payment.Id, ev.Id, attendeeId,
                    $"Simulated payment of {payment.Amount:0.00} KZT succeeded (processing fee {order.FeeTotal:0.00} KZT).");
            }
            else
            {
                payment.Status = PaymentStatus.Failed;
                audit.Add(AuditActionType.PaymentFailed, nameof(Payment), payment.Id, ev.Id, attendeeId,
                    $"Simulated payment of {payment.Amount:0.00} KZT failed.");
                notifications.Notify(order.AttendeeId, "PaymentFailed", $"Payment failed for {ev.Title}",
                    $"Your simulated payment of {order.Total:0.00} KZT failed. Your tickets stay reserved until " +
                    $"{order.CreatedAt + ReservationTime:yyyy-MM-dd HH:mm} UTC; you can retry the payment.",
                    ev.Id, order.Id, email: order.AttendeeEmail,
                    emailBody: $"Your simulated payment of {order.Total:0.00} KZT for {ev.Title} failed.\n" +
                        $"Retry before the reservation expires: {notifications.AppUrl("/orders")}");
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

            await ReleasePendingOrderAsync(order, ev, types, attendeeId, AuditActionType.OrderCancelled,
                "Pending order cancelled by the attendee.");
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
            if (order.Total > 0) return (null, "Only free orders can be cancelled. Refund paid orders instead.", ServiceError.BadRequest);

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
            notifications.Notify(order.AttendeeId, "RegistrationCancelled", $"Registration cancelled: {ev.Title}",
                $"The organizer cancelled your free registration for {ev.Title}. Its tickets are no longer valid.",
                ev.Id, order.Id, email: order.AttendeeEmail);

            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return (ToOrderResponse(order, ev.Title, false), null, ServiceError.None);
        }
        catch (Exception exception) when (IsSerializationConflict(exception))
        {
            return (null, "Order changed during this action. Please retry.", ServiceError.Conflict);
        }
    }

    /// <summary>
    /// Full refund of a confirmed paid order by the event organizer or a platform admin (SRS 4.9, UC5).
    /// The refund is simulated; the tickets become invalid and their inventory is released.
    /// </summary>
    public async Task<(OrderResponse? Order, string? Error, ServiceError Kind)> RefundOrderAsync(
        Guid eventId, Guid orderId, Guid actorId, bool isPlatformAdmin, string? reason)
    {
        var canManage = await db.Events.AsNoTracking().AnyAsync(candidate =>
            candidate.Id == eventId && (candidate.OrganizerId == actorId || isPlatformAdmin));
        if (!canManage) return (null, "Event not found.", ServiceError.NotFound);

        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            var order = await LoadOrderAsync(orderId);
            if (order is null || order.EventId != eventId) return (null, "Order not found.", ServiceError.NotFound);
            if (order.Status != OrderStatus.Confirmed) return (null, "Only confirmed orders can be refunded.", ServiceError.BadRequest);
            if (order.Total <= 0) return (null, "Free orders are cancelled, not refunded.", ServiceError.BadRequest);
            if (order.Items.Any(item => item.Ticket?.Status == TicketStatus.CheckedIn))
            {
                return (null, "The order has checked-in tickets. Reverse the check-in before refunding.", ServiceError.BadRequest);
            }

            var (ev, types) = await LoadInventoryAsync(eventId);
            if (ev is null) return (null, "Event not found.", ServiceError.NotFound);

            RefundConfirmedOrder(order, ev, types, actorId, reason);
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return (ToOrderResponse(order, ev.Title, false), null, ServiceError.None);
        }
        catch (Exception exception) when (IsSerializationConflict(exception))
        {
            return (null, "Order changed during this action. Please retry.", ServiceError.Conflict);
        }
    }

    public async Task<IReadOnlyList<RefundResponse>?> GetEventRefundsAsync(Guid eventId, Guid requesterId, bool isPlatformAdmin)
    {
        if (await GetManagedEventAsync(eventId, requesterId, isPlatformAdmin) is null) return null;
        return await db.Refunds.AsNoTracking()
            .Where(refund => refund.EventId == eventId)
            .OrderByDescending(refund => refund.CreatedAt)
            .Select(refund => new RefundResponse(refund.Id, refund.OrderId, refund.EventId, refund.Amount, refund.Reason,
                refund.InitiatedByUserId, refund.IsSimulated, refund.CreatedAt))
            .ToListAsync();
    }

    /// <summary>
    /// Settles every order of an event that is being cancelled, inside the caller's transaction: pending orders are
    /// released, free registrations are cancelled and paid orders are fully refunded (simulated). Every ticket holder
    /// is notified and gets a link to the cancellation calendar file.
    /// </summary>
    public async Task SettleOrdersForCancelledEventAsync(Event ev, Guid actorId)
    {
        var types = await db.TicketTypes.Where(ticketType => ticketType.EventId == ev.Id)
            .ToDictionaryAsync(ticketType => ticketType.Id);
        var orders = await db.Orders
            .Include(order => order.Items).ThenInclude(item => item.Ticket)
            .Where(order => order.EventId == ev.Id &&
                (order.Status == OrderStatus.Pending || order.Status == OrderStatus.Confirmed))
            .ToListAsync();

        foreach (var order in orders)
        {
            if (order.Status == OrderStatus.Pending)
            {
                await ReleasePendingOrderAsync(order, ev, types, actorId, AuditActionType.OrderCancelled,
                    "Pending order cancelled because its event was cancelled.");
                continue;
            }

            if (order.Total > 0)
            {
                RefundConfirmedOrder(order, ev, types, actorId, "Event cancelled", notify: false);
            }
            else
            {
                foreach (var item in order.Items.Where(item => item.Ticket is not null))
                {
                    item.Ticket!.Status = TicketStatus.Cancelled;
                }

                AdjustCounters(ev, types, order.Items, reservedSign: 0, soldSign: -1);
                order.Status = OrderStatus.Cancelled;
                audit.Add(AuditActionType.OrderCancelled, nameof(Order), order.Id, ev.Id, actorId,
                    "Free registration cancelled because its event was cancelled.");
            }

            var refundText = order.Total > 0 ? $" Your payment of {order.Total:0.00} KZT has been refunded (simulation)." : string.Empty;
            notifications.Notify(order.AttendeeId, "EventCancelled", $"Event cancelled: {ev.Title}",
                $"{ev.Title} has been cancelled and your tickets are no longer valid.{refundText}",
                ev.Id, order.Id, email: order.AttendeeEmail,
                emailBody: $"{ev.Title} ({ev.StartDateUtc:yyyy-MM-dd HH:mm} UTC) has been cancelled. Your tickets are no longer valid.{refundText}\n" +
                    $"Remove it from your calendar with the updated calendar file: {notifications.AppUrl($"/api/events/{ev.Id}/calendar.ics")}");
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

        return ToOrderResponse(order, order.Event.Title, !order.Event.IsCancelled);
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
        if (ticket.Status is TicketStatus.Cancelled or TicketStatus.Refunded || ticket.OrderItem.Order.Event.IsCancelled) return null;
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
        .Include(order => order.Refunds)
        .Include(order => order.Items)
            .ThenInclude(item => item.Ticket)
        .Include(order => order.Items)
            .ThenInclude(item => item.Seat)
                .ThenInclude(seat => seat!.Section)
        .AsSplitQuery();

    /// <summary>Loads an order with its payments, refunds, items, seats and tickets (without the event).</summary>
    private Task<Order?> LoadOrderAsync(Guid orderId) => db.Orders
        .Include(order => order.Payments)
        .Include(order => order.Refunds)
        .Include(order => order.Items)
            .ThenInclude(item => item.Ticket)
        .Include(order => order.Items)
            .ThenInclude(item => item.Seat)
                .ThenInclude(seat => seat!.Section)
        .AsSplitQuery()
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
            await ReleasePendingOrderAsync(order, ev, types, null, AuditActionType.OrderExpired,
                "Pending order expired after 15 minutes without payment.");
        }
    }

    private static string? ValidateSelections(IReadOnlyList<CheckoutItemRequest> items)
    {
        if (items.Count is < 1 or > 10) return "Select between 1 and 10 ticket types.";
        if (items.Any(item => item.TicketTypeId == Guid.Empty || item.Quantity is < 1 or > 100) ||
            items.Select(item => item.TicketTypeId).Distinct().Count() != items.Count)
        {
            return "Ticket selections must be valid and each ticket type may appear only once.";
        }

        return null;
    }

    private static string? ValidateRegistrationWindow(Event ev, DateTimeOffset now)
    {
        if (ev.EndDateUtc <= now) return "This event has already ended.";
        if ((ev.RegistrationOpensAt is not null && ev.RegistrationOpensAt > now) ||
            (ev.RegistrationClosesAt is not null && ev.RegistrationClosesAt <= now))
        {
            return "Registration is not currently open for this event.";
        }

        return null;
    }

    private static void AddItems(Order order, IEnumerable<CheckoutItemRequest> selections, Dictionary<Guid, TicketType> ticketTypes)
    {
        foreach (var selection in selections)
        {
            var ticketType = ticketTypes[selection.TicketTypeId];
            for (var index = 0; index < selection.Quantity; index++)
            {
                order.Items.Add(new OrderItem
                {
                    Order = order,
                    OrderId = order.Id,
                    TicketTypeId = ticketType.Id,
                    TicketTypeName = ticketType.Name,
                    UnitPrice = ticketType.Price
                });
            }
        }
    }

    /// <summary>Checks sale windows, per-order limits, inventory, event capacity and paid-sales activation for new items.</summary>
    private static (string? Error, bool Conflict) ValidateInventory(
        Event ev, Dictionary<Guid, TicketType> ticketTypes, IEnumerable<OrderItem> items, DateTimeOffset now)
    {
        var groups = items.GroupBy(item => item.TicketTypeId).ToList();
        foreach (var group in groups)
        {
            var ticketType = ticketTypes[group.Key];
            var quantity = group.Count();
            if (ticketType.IsHidden ||
                (ticketType.SalesStartAt is not null && ticketType.SalesStartAt > now) ||
                (ticketType.SalesEndAt is not null && ticketType.SalesEndAt <= now))
            {
                return ($"Ticket type '{ticketType.Name}' is not currently on sale.", false);
            }

            if (quantity > ticketType.MaxPerOrder) return ($"Ticket type '{ticketType.Name}' exceeds its per-order limit.", false);
            if (quantity > ticketType.Quantity - ticketType.SoldQuantity - ticketType.ReservedQuantity)
            {
                return ($"Ticket type '{ticketType.Name}' has insufficient inventory.", true);
            }

            if (ticketType.Price > 0 && ev.PaidSalesStatus != PaidSalesStatus.Active)
            {
                return ("Paid sales have not been activated for this event.", false);
            }
        }

        var totalQuantity = groups.Sum(group => group.Count());
        if (ev.Capacity is not null && totalQuantity > ev.Capacity.Value - ev.TicketsIssued - ev.TicketsReserved)
        {
            return ("The event does not have enough remaining capacity.", true);
        }

        return (null, false);
    }

    private async Task ApplyCampaignAsync(Order order, PromoCampaign campaign)
    {
        order.PromoCampaignId = campaign.Id;
        order.PromoCode = campaign.Code;
        order.DiscountTotal = await promoCampaigns.ApplyDiscountAsync(campaign, order.Items) ?? 0m;
        order.Total -= order.DiscountTotal;
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

    /// <summary>
    /// Marks the order confirmed, creates one ticket per item (carrying its seat), moves reserved counters to
    /// sold/issued, releases seat holds and sends the confirmation with the tickets.
    /// </summary>
    private async Task ConfirmOrderAsync(Order order, Event ev, Dictionary<Guid, TicketType> types, DateTimeOffset now)
    {
        order.Status = OrderStatus.Confirmed;
        order.ConfirmedAt = now;
        foreach (var item in order.Items)
        {
            var ticket = new Ticket
            {
                OrderItemId = item.Id,
                OrderItem = item,
                EventId = ev.Id,
                Code = CreateTicketCode(),
                AttendeeName = order.AttendeeName,
                AttendeeEmail = order.AttendeeEmail,
                SeatId = item.SeatId
            };
            item.Ticket = ticket;
            db.Tickets.Add(ticket);
        }

        AdjustCounters(ev, types, order.Items, reservedSign: -1, soldSign: 1);
        await seating.ReleaseHoldsAsync(order.Id);

        var kind = order.Total == 0 ? "Registration" : "Purchase";
        var ticketLines = string.Join("\n", order.Items.Select(item =>
            $"  • {item.TicketTypeName}{(item.Seat is null ? string.Empty : $" — {SeatingService.Label(item.Seat)}")}: ticket ID {item.Ticket!.Code}"));
        notifications.Notify(order.AttendeeId, "OrderConfirmed", $"{kind} confirmed: {ev.Title}",
            $"Your {kind.ToLowerInvariant()} for {ev.Title} is confirmed. {order.Items.Count} ticket(s) are in your account.",
            ev.Id, order.Id, email: order.AttendeeEmail,
            emailBody:
                $"Hello {order.AttendeeName},\n\nYour {kind.ToLowerInvariant()} for {ev.Title} is confirmed.\n" +
                $"When: {ev.StartDateUtc:yyyy-MM-dd HH:mm} UTC ({ev.Timezone})\nWhere: {ev.Venue}, {ev.City}\n" +
                $"Total: {order.Total:0.00} KZT{(order.Total > 0 ? " (simulated payment)" : string.Empty)}\n\n" +
                $"Your tickets:\n{ticketLines}\n\n" +
                $"Open your tickets, QR codes and printable PDFs: {notifications.AppUrl("/orders")}\n" +
                $"Add to calendar: {notifications.AppUrl($"/api/events/{ev.Id}/calendar.ics")}");
    }

    private async Task ReleasePendingOrderAsync(
        Order order, Event ev, Dictionary<Guid, TicketType> types, Guid? actorId, AuditActionType action, string description)
    {
        order.Status = OrderStatus.Cancelled;
        AdjustCounters(ev, types, order.Items, reservedSign: -1, soldSign: 0);
        await seating.ReleaseHoldsAsync(order.Id);
        audit.Add(action, nameof(Order), order.Id, ev.Id, actorId, description);
    }

    /// <summary>Refunds a confirmed paid order in full (simulation): tickets become Refunded and inventory is released.</summary>
    private Refund RefundConfirmedOrder(
        Order order, Event ev, Dictionary<Guid, TicketType> types, Guid actorId, string? reason, bool notify = true)
    {
        foreach (var item in order.Items.Where(item => item.Ticket is not null))
        {
            item.Ticket!.Status = TicketStatus.Refunded;
        }

        AdjustCounters(ev, types, order.Items, reservedSign: 0, soldSign: -1);
        order.Status = OrderStatus.Refunded;
        var refund = new Refund
        {
            OrderId = order.Id,
            EventId = ev.Id,
            Amount = order.Total,
            Reason = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim(),
            InitiatedByUserId = actorId,
            IsSimulated = true,
            CreatedAt = DateTimeOffset.UtcNow
        };
        // Adding the refund to the context also attaches it to order.Refunds through relationship fix-up.
        db.Refunds.Add(refund);
        if (!order.Refunds.Contains(refund)) order.Refunds.Add(refund);
        audit.Add(AuditActionType.OrderRefunded, nameof(Order), order.Id, ev.Id, actorId,
            $"Full refund of {refund.Amount:0.00} KZT (simulation){(refund.Reason is null ? string.Empty : $": {refund.Reason}")}.");
        if (notify)
        {
            notifications.Notify(order.AttendeeId, "RefundCompleted", $"Refund completed: {ev.Title}",
                $"Your order for {ev.Title} was refunded in full ({refund.Amount:0.00} KZT, simulation). Its tickets are no longer valid.",
                ev.Id, order.Id, email: order.AttendeeEmail);
        }

        return refund;
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

    private static string DescribeTicketTypeChanges(TicketType current, UpdateTicketTypeRequest request)
    {
        var changes = new List<string>();
        if (decimal.Round(request.Price, 2) != current.Price) changes.Add($"price {current.Price:0.00} → {request.Price:0.00} KZT");
        if (request.Quantity != current.Quantity) changes.Add($"quantity {current.Quantity} → {request.Quantity}");
        if (request.IsHidden != current.IsHidden) changes.Add(request.IsHidden ? "hidden" : "visible again");
        if (request.Name.Trim() != current.Name) changes.Add($"renamed from '{current.Name}'");
        return changes.Count == 0 ? string.Empty : $": {string.Join(", ", changes)}";
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
                                : null,
                            item.Seat?.Section?.Name,
                            item.Seat?.RowLabel,
                            item.Seat?.Number))
                        .ToList()))
                .ToList(),
            order.DiscountTotal,
            order.FeeTotal,
            order.Status == OrderStatus.Pending ? order.CreatedAt + ReservationTime : null,
            latestPayment?.Status.ToString(),
            order.PromoCode,
            order.Refunds.Sum(refund => refund.Amount),
            order.ConfirmedAt);
    }

    private static byte[] GenerateQr(string code)
    {
        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(code, QRCodeGenerator.ECCLevel.Q);
        var qrCode = new PngByteQRCode(data);
        return qrCode.GetGraphic(8);
    }

    private static string CreateTicketCode() => "TKT_" + Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
        .TrimEnd('=')
        .Replace('+', '-')
        .Replace('/', '_');

    private static bool IsValidSalesWindow(DateTimeOffset? startAt, DateTimeOffset? endAt) =>
        startAt is null || endAt is null || endAt > startAt;

    private static bool IsSerializationConflict(Exception exception) =>
        exception is PostgresException { SqlState: PostgresErrorCodes.SerializationFailure or PostgresErrorCodes.UniqueViolation } ||
        (exception.InnerException is not null && IsSerializationConflict(exception.InnerException));
}
