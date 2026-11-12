using System.Text;
using BiletFlow.Api.Models;
using BiletFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BiletFlow.Api.Controllers;

/// <summary>Administrative portal API for platform administrators (SRS 4.12).</summary>
[ApiController]
[Route("api/admin")]
[Authorize(Policy = "PlatformAdminOnly")]
public sealed class AdminController(
    AdminService admin, PlatformSettingsService settings, SupportService support) : ControllerBase
{
    [HttpGet("overview")]
    public async Task<IActionResult> Overview() => Ok(await admin.GetOverviewAsync());

    // Users
    [HttpGet("users")]
    public async Task<IActionResult> Users([FromQuery] string? search, [FromQuery] string? role, [FromQuery] bool? suspended) =>
        Ok(await admin.SearchUsersAsync(search, role, suspended));

    [HttpPost("users/{userId:guid}/suspend")]
    public Task<IActionResult> SuspendUser(Guid userId, [FromBody] AdminReasonRequest? request) =>
        SetUserSuspended(userId, true, request?.Reason);

    [HttpPost("users/{userId:guid}/reinstate")]
    public Task<IActionResult> ReinstateUser(Guid userId) => SetUserSuspended(userId, false, null);

    [HttpPut("users/{userId:guid}/role")]
    public async Task<IActionResult> ChangeRole(Guid userId, [FromBody] ChangeUserRoleRequest request)
    {
        var result = await admin.ChangeRoleAsync(AdminId, userId, request.Role);
        return ToResult(result.User, result.Error, result.Kind);
    }

    // Events
    [HttpGet("events")]
    public async Task<IActionResult> Events([FromQuery] string? search, [FromQuery] string? status) =>
        Ok(await admin.SearchEventsAsync(search, status));

    [HttpPost("events/{eventId:guid}/suspend")]
    public Task<IActionResult> SuspendEvent(Guid eventId, [FromBody] AdminReasonRequest? request) =>
        SetEventSuspended(eventId, true, request?.Reason);

    [HttpPost("events/{eventId:guid}/reinstate")]
    public Task<IActionResult> ReinstateEvent(Guid eventId) => SetEventSuspended(eventId, false, null);

    [HttpPost("events/{eventId:guid}/paid-sales/suspend")]
    public async Task<IActionResult> SuspendPaidSales(Guid eventId, [FromBody] AdminReasonRequest? request)
    {
        var suspended = await admin.SuspendPaidSalesAsync(AdminId, eventId, request?.Reason);
        return suspended
            ? Ok(new { eventId, paidSalesStatus = "Suspended", paidSalesActivated = false })
            : NotFound(new { error = "Event not found." });
    }

    [HttpPost("events/{eventId:guid}/paid-sales/reinstate")]
    public async Task<IActionResult> ReinstatePaidSales(Guid eventId)
    {
        var checklist = await admin.ReinstatePaidSalesAsync(AdminId, eventId);
        return checklist is null ? NotFound(new { error = "Event not found." }) : Ok(checklist);
    }

    // Reports
    [HttpGet("reports")]
    public async Task<IActionResult> Reports([FromQuery] string? status) => Ok(await admin.GetReportsAsync(status));

    [HttpPut("reports/{reportId:guid}")]
    public async Task<IActionResult> ResolveReport(Guid reportId, [FromBody] ResolveEventReportRequest request)
    {
        var result = await admin.ResolveReportAsync(AdminId, reportId, request);
        return ToResult(result.Report, result.Error, result.Kind);
    }

    // Orders, payments, refunds, activations, promo activity, support
    [HttpGet("orders")]
    public async Task<IActionResult> Orders([FromQuery] string? search, [FromQuery] string? status, [FromQuery] Guid? eventId) =>
        Ok(await admin.SearchOrdersAsync(search, status, eventId));

    [HttpGet("payments")]
    public async Task<IActionResult> Payments([FromQuery] string? status, [FromQuery] string? search) =>
        Ok(await admin.GetPaymentsAsync(status, search));

    [HttpGet("refunds")]
    public async Task<IActionResult> Refunds() => Ok(await admin.GetRefundsAsync());

    [HttpGet("paid-sales-activations")]
    public async Task<IActionResult> Activations() => Ok(await admin.GetActivationsAsync());

    [HttpGet("promo-activity")]
    public async Task<IActionResult> PromoActivity() => Ok(await admin.GetPromoActivityAsync());

    [HttpGet("support-cases")]
    public async Task<IActionResult> SupportCases([FromQuery] bool? escalated, [FromQuery] string? status, [FromQuery] Guid? eventId) =>
        Ok(await support.GetCasesAsync(AdminId, true, eventId, status, escalated));

    // Settings
    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings() => Ok(PlatformSettingsService.ToResponse(await settings.GetAsync()));

    [HttpPut("settings")]
    public async Task<IActionResult> UpdateSettings([FromBody] UpdatePlatformSettingsRequest request) =>
        Ok(PlatformSettingsService.ToResponse(await settings.UpdateAsync(AdminId, request)));

    // Reports export
    [HttpGet("exports/{type}")]
    public async Task<IActionResult> Export(string type)
    {
        var csv = await admin.ExportCsvAsync(type);
        return csv is null
            ? BadRequest(new { error = $"Export type must be one of: {string.Join(", ", AdminService.ExportTypes)}." })
            : File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv)).ToArray(), "text/csv",
                $"biletflow-{type.ToLowerInvariant()}-{DateTime.UtcNow:yyyyMMdd}.csv");
    }

    private Guid AdminId => User.GetUserId() ?? throw new UnauthorizedAccessException();

    private async Task<IActionResult> SetUserSuspended(Guid userId, bool suspend, string? reason)
    {
        var result = await admin.SetUserSuspendedAsync(AdminId, userId, suspend, reason);
        return ToResult(result.User, result.Error, result.Kind);
    }

    private async Task<IActionResult> SetEventSuspended(Guid eventId, bool suspend, string? reason)
    {
        var result = await admin.SetEventSuspendedAsync(AdminId, eventId, suspend, reason);
        return result.Done
            ? Ok(new { eventId, isSuspended = suspend })
            : NotFound(new { error = result.Error });
    }

    private IActionResult ToResult(object? value, string? error, ServiceError kind) => value is not null
        ? Ok(value)
        : kind switch
        {
            ServiceError.NotFound => NotFound(new { error }),
            ServiceError.Conflict => Conflict(new { error }),
            _ => BadRequest(new { error })
        };
}
