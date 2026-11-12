using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BiletFlow.Api.Services;

/// <summary>
/// Basic organizer analytics (SRS 4.15), calculated only from BiletFlow order, ticket, refund, campaign and check-in
/// records. Read-only, untracked queries outside any transaction, so they never block checkout.
/// Revenue definitions (KZT, demonstration data):
/// gross = ticket prices of orders that were confirmed (including ones refunded later); discounts = their promo discounts;
/// refunds = refunded amounts; net = gross − discounts − refunds; fees = simulated processing charges of orders that are
/// still confirmed; estimated payout = net − fees.
/// </summary>
public sealed class AnalyticsService(AuthDbContext db)
{
    public async Task<(EventAnalyticsResponse? Analytics, string? Error)> GetEventAnalyticsAsync(
        Guid eventId, Guid requesterId, bool isPlatformAdmin, DateTimeOffset? from, DateTimeOffset? to, Guid? ticketTypeId)
    {
        if (from is not null && to is not null && to < from) return (null, "The end of the date range must be after its start.");

        var ev = await db.Events.AsNoTracking().SingleOrDefaultAsync(candidate =>
            candidate.Id == eventId && (candidate.OrganizerId == requesterId || isPlatformAdmin));
        if (ev is null) return (null, "Event not found.");

        var ticketTypes = await db.TicketTypes.AsNoTracking().Where(ticketType => ticketType.EventId == eventId)
            .OrderBy(ticketType => ticketType.Price).ThenBy(ticketType => ticketType.Name).ToListAsync();
        if (ticketTypeId is not null && ticketTypes.All(ticketType => ticketType.Id != ticketTypeId))
        {
            return (null, "Ticket type not found for this event.");
        }

        var items = await LoadSoldItemsAsync([eventId]);
        var refunds = await db.Refunds.AsNoTracking().Where(refund => refund.EventId == eventId)
            .ToDictionaryAsync(refund => refund.OrderId, refund => refund.CreatedAt);
        var ticketStatuses = await db.Tickets.AsNoTracking().Where(ticket => ticket.EventId == eventId)
            .Select(ticket => new { ticket.OrderItem.TicketTypeId, ticket.Status })
            .ToListAsync();
        var campaigns = await db.PromoCampaigns.AsNoTracking().Where(campaign => campaign.EventId == eventId)
            .OrderBy(campaign => campaign.Code).ToListAsync();

        var selectedTypes = ticketTypeId is null ? ticketTypes : ticketTypes.Where(type => type.Id == ticketTypeId).ToList();
        var filteredItems = items.Where(item => ticketTypeId is null || item.TicketTypeId == ticketTypeId).ToList();
        var rangeItems = filteredItems.Where(item => InRange(item.ConfirmedAt, from, to)).ToList();
        var filteredStatuses = ticketStatuses.Where(row => ticketTypeId is null || row.TicketTypeId == ticketTypeId).ToList();

        // Capacity: the event capacity when no ticket-type filter applies, otherwise the ticket type quantity.
        var sold = filteredStatuses.Count(row => row.Status is TicketStatus.Valid or TicketStatus.CheckedIn);
        var reserved = selectedTypes.Sum(type => type.ReservedQuantity);
        var typeCapacity = selectedTypes.Sum(type => type.Quantity);
        var capacity = ticketTypeId is null && ev.Capacity is not null ? Math.Min(ev.Capacity.Value, Math.Max(typeCapacity, 0)) : typeCapacity;
        if (ticketTypeId is null && ev.Capacity is not null && typeCapacity == 0) capacity = ev.Capacity.Value;
        var remaining = Math.Max(capacity - sold - reserved, 0);

        var revenue = BuildRevenue(rangeItems, refunds, from, to);
        var salesOverTime = rangeItems
            .GroupBy(item => LocalDate(item.ConfirmedAt, ev.Timezone))
            .OrderBy(group => group.Key)
            .Select(group => new SalesOverTimePoint(group.Key, group.Count(),
                group.Sum(item => item.UnitPrice - item.DiscountAmount)))
            .ToList();

        var byType = selectedTypes.Select(type =>
        {
            var typeItems = rangeItems.Where(item => item.TicketTypeId == type.Id).ToList();
            var gross = typeItems.Sum(item => item.UnitPrice);
            var discounts = typeItems.Sum(item => item.DiscountAmount);
            var refunded = typeItems.Where(item => item.OrderStatus == OrderStatus.Refunded &&
                    refunds.TryGetValue(item.OrderId, out var at) && InRange(at, from, to))
                .Sum(item => item.UnitPrice - item.DiscountAmount);
            return new TicketTypeSalesRow(type.Id, type.Name, type.Price, type.Quantity,
                ticketStatuses.Count(row => row.TicketTypeId == type.Id && row.Status is TicketStatus.Valid or TicketStatus.CheckedIn),
                type.ReservedQuantity,
                ticketStatuses.Count(row => row.TicketTypeId == type.Id && row.Status == TicketStatus.Refunded),
                ticketStatuses.Count(row => row.TicketTypeId == type.Id && row.Status == TicketStatus.CheckedIn),
                gross, discounts, gross - discounts - refunded);
        }).ToList();

        var campaignRows = campaigns.Select(campaign =>
        {
            var campaignItems = rangeItems.Where(item => item.PromoCampaignId == campaign.Id).ToList();
            var liveItems = campaignItems.Where(item => item.OrderStatus == OrderStatus.Confirmed).ToList();
            var gross = liveItems.Sum(item => item.UnitPrice);
            var discount = liveItems.Sum(item => item.DiscountAmount);
            return new CampaignSalesRow(campaign.Id, campaign.Code, campaign.IsEnabled, campaign.LinkVisits,
                liveItems.Select(item => item.OrderId).Distinct().Count(), liveItems.Count, gross, discount, gross - discount);
        }).ToList();

        var checkedIn = filteredStatuses.Count(row => row.Status == TicketStatus.CheckedIn);
        var attendance = new AttendanceMetrics(sold, checkedIn, sold - checkedIn,
            sold == 0 ? 0 : decimal.Round(checkedIn * 100m / sold, 2));

        return (new EventAnalyticsResponse(ev.Id, ev.Title, ev.LifecycleStatus, from, to, ticketTypeId,
            new CapacityMetrics(capacity, sold, reserved, remaining, capacity == 0 ? 0 : decimal.Round(sold * 100m / capacity, 2)),
            revenue, salesOverTime, byType, campaignRows, attendance), null);
    }

    /// <summary>Totals across all events the organizer manages, plus one summary row per event.</summary>
    public async Task<(OrganizerDashboardResponse? Dashboard, string? Error)> GetOrganizerDashboardAsync(
        Guid organizerId, DateTimeOffset? from, DateTimeOffset? to)
    {
        if (from is not null && to is not null && to < from) return (null, "The end of the date range must be after its start.");

        var events = await db.Events.AsNoTracking().Where(ev => ev.OrganizerId == organizerId)
            .OrderByDescending(ev => ev.StartDateUtc).ToListAsync();
        var eventIds = events.Select(ev => ev.Id).ToList();
        var items = (await LoadSoldItemsAsync(eventIds)).Where(item => InRange(item.ConfirmedAt, from, to)).ToList();
        var refunds = await db.Refunds.AsNoTracking().Where(refund => eventIds.Contains(refund.EventId))
            .ToDictionaryAsync(refund => refund.OrderId, refund => refund.CreatedAt);
        var tickets = await db.Tickets.AsNoTracking().Where(ticket => eventIds.Contains(ticket.EventId))
            .GroupBy(ticket => new { ticket.EventId, ticket.Status })
            .Select(group => new { group.Key.EventId, group.Key.Status, Count = group.Count() })
            .ToListAsync();
        var quantities = await db.TicketTypes.AsNoTracking().Where(type => eventIds.Contains(type.EventId))
            .GroupBy(type => type.EventId).Select(group => new { EventId = group.Key, Quantity = group.Sum(type => type.Quantity) })
            .ToDictionaryAsync(row => row.EventId, row => row.Quantity);

        var now = DateTimeOffset.UtcNow;
        var revenue = BuildRevenue(items, refunds, from, to);
        var rows = events.Select(ev =>
        {
            var eventItems = items.Where(item => item.EventId == ev.Id).ToList();
            var eventRevenue = BuildRevenue(eventItems, refunds, from, to);
            var soldCount = tickets.Where(row => row.EventId == ev.Id && row.Status is TicketStatus.Valid or TicketStatus.CheckedIn)
                .Sum(row => row.Count);
            var typeQuantity = quantities.GetValueOrDefault(ev.Id);
            return new OrganizerEventSummary(ev.Id, ev.Title, ev.StartDateUtc, ev.GetLifecycleStatus(now), ev.IsPublished,
                ev.PaidSalesStatus.ToString(), soldCount,
                ev.Capacity is null ? typeQuantity : typeQuantity == 0 ? ev.Capacity.Value : Math.Min(ev.Capacity.Value, typeQuantity),
                eventRevenue.NetRevenue,
                tickets.Where(row => row.EventId == ev.Id && row.Status == TicketStatus.CheckedIn).Sum(row => row.Count));
        }).ToList();

        return (new OrganizerDashboardResponse(events.Count,
            rows.Count(row => row.LifecycleStatus == "Upcoming"), rows.Count(row => row.LifecycleStatus == "Active"),
            rows.Count(row => row.LifecycleStatus == "Completed"), rows.Count(row => row.LifecycleStatus == "Cancelled"),
            rows.Sum(row => row.TicketsSold), revenue.GrossSales, revenue.NetRevenue, revenue.EstimatedPayout, "KZT", true, rows), null);
    }

    private sealed record SoldItem(
        Guid EventId, Guid OrderId, Guid TicketTypeId, decimal UnitPrice, decimal DiscountAmount, OrderStatus OrderStatus,
        DateTimeOffset ConfirmedAt, decimal OrderTotal, decimal OrderFee, Guid? PromoCampaignId);

    /// <summary>Items of orders that were confirmed at some point (still confirmed or refunded later).</summary>
    private async Task<List<SoldItem>> LoadSoldItemsAsync(IReadOnlyCollection<Guid> eventIds)
    {
        var rows = await db.OrderItems.AsNoTracking()
            .Where(item => eventIds.Contains(item.Order.EventId) && item.Order.ConfirmedAt != null &&
                (item.Order.Status == OrderStatus.Confirmed || item.Order.Status == OrderStatus.Refunded))
            .Select(item => new
            {
                item.Order.EventId, item.OrderId, item.TicketTypeId, item.UnitPrice, item.DiscountAmount, item.Order.Status,
                ConfirmedAt = item.Order.ConfirmedAt!.Value, item.Order.Total, item.Order.FeeTotal, item.Order.PromoCampaignId
            })
            .ToListAsync();
        return rows.Select(row => new SoldItem(row.EventId, row.OrderId, row.TicketTypeId, row.UnitPrice, row.DiscountAmount,
            row.Status, row.ConfirmedAt, row.Total, row.FeeTotal, row.PromoCampaignId)).ToList();
    }

    private static RevenueMetrics BuildRevenue(
        IReadOnlyCollection<SoldItem> items, IReadOnlyDictionary<Guid, DateTimeOffset> refunds, DateTimeOffset? from, DateTimeOffset? to)
    {
        var gross = items.Sum(item => item.UnitPrice);
        var discounts = items.Sum(item => item.DiscountAmount);
        var refunded = items.Where(item => item.OrderStatus == OrderStatus.Refunded &&
                refunds.TryGetValue(item.OrderId, out var at) && InRange(at, from, to))
            .Sum(item => item.UnitPrice - item.DiscountAmount);
        // The processing fee belongs to the whole order; with a ticket-type filter it is shared by item value.
        var fees = items.Where(item => item.OrderStatus == OrderStatus.Confirmed && item.OrderTotal > 0)
            .Sum(item => item.OrderFee * (item.UnitPrice - item.DiscountAmount) / item.OrderTotal);
        fees = decimal.Round(fees, 2);
        var net = gross - discounts - refunded;
        return new RevenueMetrics("KZT", gross, discounts, refunded, fees, net, net - fees,
            items.Where(item => item.OrderStatus == OrderStatus.Confirmed).Select(item => item.OrderId).Distinct().Count(),
            items.Where(item => item.OrderStatus == OrderStatus.Refunded).Select(item => item.OrderId).Distinct().Count(),
            IsDemonstration: true);
    }

    private static bool InRange(DateTimeOffset value, DateTimeOffset? from, DateTimeOffset? to) =>
        (from is null || value >= from) && (to is null || value <= to);

    private static DateOnly LocalDate(DateTimeOffset value, string timezone)
    {
        var zone = TimeZoneInfo.TryFindSystemTimeZoneById(timezone, out var found) ? found : TimeZoneInfo.Utc;
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(value, zone).DateTime);
    }
}
