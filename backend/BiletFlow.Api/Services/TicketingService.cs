using System.Data;
using System.Security.Cryptography;
using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using QRCoder;

namespace BiletFlow.Api.Services;

public sealed class TicketingService(AuthDbContext db)
{
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
        return ticketTypes.Select(ToTicketTypeResponse).ToList();
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
        return (ToTicketTypeResponse(ticketType), null);
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
            if (request.Quantity < ticketType.SoldQuantity) return (null, "Quantity cannot be lower than the number of tickets already sold.");
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
            return (ToTicketTypeResponse(ticketType), null);
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

        ev.PaidSalesActivated = true;
        ev.UpdatedAt = DateTimeOffset.UtcNow;
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
            var ev = await db.Events.SingleOrDefaultAsync(candidate => candidate.Id == request.EventId);
            if (ev is null || !ev.IsPublished) return (null, "Published event not found.", false);

            var selectedIds = request.Items.Select(item => item.TicketTypeId).ToArray();
            var ticketTypes = await db.TicketTypes
                .Where(ticketType => ticketType.EventId == ev.Id && selectedIds.Contains(ticketType.Id))
                .ToDictionaryAsync(ticketType => ticketType.Id);
            if (ticketTypes.Count != request.Items.Count) return (null, "One or more ticket types are unavailable.", false);

            var now = DateTimeOffset.UtcNow;
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

                if (selection.Quantity > ticketType.Quantity - ticketType.SoldQuantity)
                {
                    return (null, $"Ticket type '{ticketType.Name}' has insufficient inventory.", true);
                }

                if (ticketType.Price > 0 && !ev.PaidSalesActivated)
                {
                    return (null, "Paid sales have not been activated for this event.", false);
                }
            }

            var order = new Order
            {
                AttendeeId = attendeeId,
                EventId = ev.Id,
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
                ticketType.SoldQuantity += selection.Quantity;
                var item = new OrderItem
                {
                    Order = order,
                    TicketTypeId = ticketType.Id,
                    TicketTypeName = ticketType.Name,
                    Quantity = selection.Quantity,
                    UnitPrice = ticketType.Price
                };

                for (var index = 0; index < selection.Quantity; index++)
                {
                    item.Tickets.Add(new Ticket
                    {
                        Code = CreateTicketCode(),
                        AttendeeName = request.AttendeeName.Trim(),
                        AttendeeEmail = request.AttendeeEmail.Trim().ToLowerInvariant(),
                        IssuedAt = now
                    });
                }

                order.Items.Add(item);
            }

            if (order.Total > 0)
            {
                order.Payment = new Payment
                {
                    Amount = order.Total,
                    ProviderReference = $"SIM-{Guid.NewGuid():N}",
                    CreatedAt = now
                };
            }

            db.Orders.Add(order);
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return (ToOrderResponse(order, ev.Title), null, false);
        }
        catch (Exception exception) when (IsSerializationConflict(exception))
        {
            return (null, "Inventory changed during checkout. Please retry.", true);
        }
    }

    public async Task<IReadOnlyList<OrderResponse>> GetAttendeeOrdersAsync(Guid attendeeId)
    {
        var orders = await LoadOrders()
            .Where(order => order.AttendeeId == attendeeId)
            .OrderByDescending(order => order.CreatedAt)
            .ToListAsync();
        return orders.Select(order => ToOrderResponse(order, order.Event.Title)).ToList();
    }

    public async Task<OrderResponse?> GetOrderAsync(Guid orderId, Guid requesterId, bool isPlatformAdmin)
    {
        var order = await LoadOrders().SingleOrDefaultAsync(candidate => candidate.Id == orderId);
        if (order is null || (order.AttendeeId != requesterId && order.Event.OrganizerId != requesterId && !isPlatformAdmin))
        {
            return null;
        }

        return ToOrderResponse(order, order.Event.Title);
    }

    public async Task<IReadOnlyList<OrderResponse>?> GetEventOrdersAsync(Guid eventId, Guid organizerId, bool isPlatformAdmin)
    {
        var ev = await GetManagedEventAsync(eventId, organizerId, isPlatformAdmin);
        if (ev is null) return null;
        var orders = await LoadOrders()
            .Where(order => order.EventId == eventId)
            .OrderByDescending(order => order.CreatedAt)
            .ToListAsync();
        return orders.Select(order => ToOrderResponse(order, ev.Title)).ToList();
    }

    public async Task<byte[]?> GetTicketQrAsync(Guid ticketId, Guid requesterId, bool isPlatformAdmin)
    {
        var ticket = await db.Tickets
            .Include(candidate => candidate.OrderItem)
            .ThenInclude(item => item.Order)
            .ThenInclude(order => order.Event)
            .SingleOrDefaultAsync(candidate => candidate.Id == ticketId);
        if (ticket is null) return null;
        var order = ticket.OrderItem.Order;
        if (order.AttendeeId != requesterId && order.Event.OrganizerId != requesterId && !isPlatformAdmin)
        {
            return null;
        }

        return GenerateQr(ticket.Code);
    }

    private IQueryable<Order> LoadOrders() => db.Orders
        .Include(order => order.Event)
        .Include(order => order.Payment)
        .Include(order => order.Items)
            .ThenInclude(item => item.Tickets);

    private async Task<Event?> GetManagedEventAsync(Guid eventId, Guid requesterId, bool isPlatformAdmin)
    {
        var ev = await db.Events.SingleOrDefaultAsync(candidate => candidate.Id == eventId);
        return ev is not null && (ev.OrganizerId == requesterId || isPlatformAdmin) ? ev : null;
    }

    private static TicketTypeResponse ToTicketTypeResponse(TicketType ticketType) => new(
        ticketType.Id,
        ticketType.EventId,
        ticketType.Name,
        ticketType.Description,
        ticketType.Price,
        ticketType.Quantity,
        ticketType.SoldQuantity,
        ticketType.Quantity - ticketType.SoldQuantity,
        ticketType.SalesStartAt,
        ticketType.SalesEndAt,
        ticketType.MaxPerOrder,
        ticketType.IsHidden);

    private static OrderResponse ToOrderResponse(Order order, string eventTitle) => new(
        order.Id,
        order.EventId,
        eventTitle,
        order.Status.ToString(),
        order.Payment is null ? "Free" : "Simulation",
        order.Total,
        order.CreatedAt,
        order.Items.Select(item => new OrderItemResponse(
            item.TicketTypeId,
            item.TicketTypeName,
            item.Quantity,
            item.UnitPrice,
            item.Tickets.Select(ticket => new TicketResponse(
                ticket.Id,
                ticket.Code,
                ticket.Status.ToString(),
                ticket.AttendeeName,
                ticket.AttendeeEmail,
                item.TicketTypeName,
                $"data:image/png;base64,{Convert.ToBase64String(GenerateQr(ticket.Code))}"))
                .ToList()))
            .ToList());

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
