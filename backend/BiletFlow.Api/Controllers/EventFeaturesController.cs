using System.Text;
using BiletFlow.Api.Models;
using BiletFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BiletFlow.Api.Controllers;

/// <summary>Event analytics, history, calendar export, assigned seating, refunds, paid-sales activation and reports.</summary>
[ApiController]
[Authorize]
public sealed class EventFeaturesController(
    AnalyticsService analytics,
    EventService events,
    CalendarService calendar,
    SeatingService seating,
    TicketingService ticketing,
    PaidSalesService paidSales,
    AdminService admin) : ControllerBase
{
    // ---- Analytics & history (SRS 4.15, 4.16) ------------------------------------------------------------------

    [Authorize(Policy = "OrganizerOnly")]
    [HttpGet("api/events/{eventId:guid}/analytics")]
    public async Task<IActionResult> EventAnalytics(
        Guid eventId, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, [FromQuery] Guid? ticketTypeId)
    {
        var result = await analytics.GetEventAnalyticsAsync(eventId, UserId, User.IsPlatformAdmin(), from, to, ticketTypeId);
        return result.Analytics is not null
            ? Ok(result.Analytics)
            : result.Error == "Event not found." ? NotFound(new { error = result.Error }) : BadRequest(new { error = result.Error });
    }

    [Authorize(Policy = "OrganizerOnly")]
    [HttpGet("api/organizer/dashboard")]
    public async Task<IActionResult> Dashboard([FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to)
    {
        var result = await analytics.GetOrganizerDashboardAsync(UserId, from, to);
        return result.Dashboard is null ? BadRequest(new { error = result.Error }) : Ok(result.Dashboard);
    }

    /// <param name="type">Comma-separated activity types, see GET /api/events/history/activity-types.</param>
    [Authorize(Policy = "OrganizerOnly")]
    [HttpGet("api/events/{eventId:guid}/history")]
    public async Task<IActionResult> History(
        Guid eventId, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to, [FromQuery] string? type)
    {
        var result = await events.GetHistoryAsync(eventId, UserId, User.IsPlatformAdmin(), from, to, type);
        return result.Entries is not null
            ? Ok(result.Entries)
            : result.Error == "Event not found." ? NotFound(new { error = result.Error }) : BadRequest(new { error = result.Error });
    }

    [AllowAnonymous]
    [HttpGet("api/events/history/activity-types")]
    public IActionResult ActivityTypes() => Ok(EventService.ActivityTypes);

    // ---- Calendar export (SRS 4.11) -----------------------------------------------------------------------------

    [AllowAnonymous]
    [HttpGet("api/events/{eventId:guid}/calendar.ics")]
    public async Task<IActionResult> CalendarFile(Guid eventId)
    {
        var file = await calendar.BuildIcsAsync(eventId, User.GetUserId(), User.IsPlatformAdmin());
        return file is null
            ? NotFound()
            : File(Encoding.UTF8.GetBytes(file.Value.Content), "text/calendar; charset=utf-8", file.Value.FileName);
    }

    [AllowAnonymous]
    [HttpGet("api/events/{eventId:guid}/calendar-links")]
    public async Task<IActionResult> CalendarLinks(Guid eventId)
    {
        var links = await calendar.GetLinksAsync(eventId, User.GetUserId(), User.IsPlatformAdmin());
        return links is null ? NotFound() : Ok(links);
    }

    // ---- Assigned seating (SRS 4.3.1) ---------------------------------------------------------------------------

    [AllowAnonymous]
    [HttpGet("api/venues")]
    public async Task<IActionResult> Venues() => Ok(await seating.GetVenuesAsync());

    [AllowAnonymous]
    [HttpGet("api/events/{eventId:guid}/seat-map")]
    public async Task<IActionResult> SeatMap(Guid eventId)
    {
        var map = await seating.GetSeatMapAsync(eventId, User.GetUserId(), User.IsPlatformAdmin());
        return map is null ? NotFound() : Ok(map);
    }

    [Authorize(Policy = "OrganizerOnly")]
    [HttpPut("api/events/{eventId:guid}/seating")]
    public async Task<IActionResult> ConfigureSeating(Guid eventId, [FromBody] ConfigureSeatingRequest request)
    {
        var result = await seating.ConfigureAsync(eventId, UserId, User.IsPlatformAdmin(), request);
        return ToResult(result.SeatMap, result.Error, result.Kind);
    }

    // ---- Checkout quote ------------------------------------------------------------------------------------------

    /// <summary>Server-side price and promo validation before checkout, without reserving tickets.</summary>
    [AllowAnonymous]
    [HttpPost("api/orders/quote")]
    public async Task<IActionResult> Quote([FromBody] CheckoutQuoteRequest request)
    {
        var result = await ticketing.QuoteAsync(request);
        return result.Quote is null ? BadRequest(new { error = result.Error }) : Ok(result.Quote);
    }

    // ---- Refunds (SRS 4.9) ---------------------------------------------------------------------------------------

    [Authorize(Policy = "OrganizerOnly")]
    [HttpPost("api/events/{eventId:guid}/orders/{orderId:guid}/refund")]
    public async Task<IActionResult> Refund(Guid eventId, Guid orderId, [FromBody] RefundOrderRequest? request)
    {
        var result = await ticketing.RefundOrderAsync(eventId, orderId, UserId, User.IsPlatformAdmin(), request?.Reason);
        return ToResult(result.Order, result.Error, result.Kind);
    }

    [Authorize(Policy = "OrganizerOnly")]
    [HttpGet("api/events/{eventId:guid}/refunds")]
    public async Task<IActionResult> Refunds(Guid eventId)
    {
        var refunds = await ticketing.GetEventRefundsAsync(eventId, UserId, User.IsPlatformAdmin());
        return refunds is null ? NotFound() : Ok(refunds);
    }

    // ---- Paid-sales activation (SRS 4.5) -------------------------------------------------------------------------

    [Authorize(Policy = "OrganizerOnly")]
    [HttpGet("api/events/{eventId:guid}/paid-sales")]
    public async Task<IActionResult> PaidSalesChecklist(Guid eventId)
    {
        var checklist = await paidSales.GetChecklistAsync(eventId, UserId, User.IsPlatformAdmin());
        return checklist is null ? NotFound() : Ok(checklist);
    }

    [Authorize(Policy = "OrganizerOnly")]
    [HttpPost("api/events/{eventId:guid}/paid-sales/activation-fee/pay-simulation")]
    public async Task<IActionResult> PayActivationFee(Guid eventId)
    {
        var result = await paidSales.PayActivationFeeAsync(eventId, UserId, User.IsPlatformAdmin());
        return ToResult(result.Checklist, result.Error, result.Kind);
    }

    [Authorize(Policy = "OrganizerOnly")]
    [HttpPost("api/organizer/verification-simulation")]
    public async Task<IActionResult> VerifyOrganizer()
    {
        var result = await paidSales.VerifyOrganizerSimulationAsync(UserId);
        return result.Verified
            ? Ok(new { isVerified = true, isSimulation = true })
            : BadRequest(new { error = result.Error });
    }

    // ---- Reports (SRS 4.12) ----------------------------------------------------------------------------------------

    [HttpPost("api/events/{eventId:guid}/reports")]
    public async Task<IActionResult> ReportEvent(Guid eventId, [FromBody] CreateEventReportRequest request)
    {
        var result = await admin.ReportEventAsync(UserId, eventId, request);
        return result.Report is null
            ? ToResult(null, result.Error, result.Kind)
            : StatusCode(StatusCodes.Status201Created, result.Report);
    }

    private Guid UserId => User.GetUserId() ?? throw new UnauthorizedAccessException();

    private IActionResult ToResult(object? value, string? error, ServiceError kind) => value is not null
        ? Ok(value)
        : kind switch
        {
            ServiceError.NotFound => NotFound(new { error }),
            ServiceError.Conflict => Conflict(new { error }),
            _ => BadRequest(new { error })
        };
}
