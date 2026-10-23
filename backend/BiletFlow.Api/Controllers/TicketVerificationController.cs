using System.Security.Claims;
using BiletFlow.Api.Models;
using BiletFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BiletFlow.Api.Controllers;

[ApiController]
[Authorize]
public sealed class TicketVerificationController(TicketVerificationService verification) : ControllerBase
{
    [HttpGet("api/event-admin/events")]
    public async Task<IActionResult> GetAssignedEvents()
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var events = await verification.GetAssignedEventsAsync(userId.Value);
        return events is null ? Forbid() : Ok(events);
    }

    [Authorize(Policy = "OrganizerOnly")]
    [HttpGet("api/events/{eventId:guid}/event-admins")]
    public async Task<IActionResult> GetEventAdmins(Guid eventId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var assigned = await verification.GetEventAdminsAsync(eventId, userId.Value, IsPlatformAdmin());
        return assigned is null ? NotFound() : Ok(assigned);
    }

    [Authorize(Policy = "OrganizerOnly")]
    [HttpPost("api/events/{eventId:guid}/event-admins")]
    public async Task<IActionResult> Assign(Guid eventId, [FromBody] EventAdminRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var result = await verification.AssignAsync(eventId, userId.Value, IsPlatformAdmin(), request.Email);
        if (!result.Assigned)
        {
            return result.Error == "Event not found."
                ? NotFound(new { error = result.Error })
                : result.Error == "This user is already assigned to the event."
                    ? Conflict(new { error = result.Error })
                    : BadRequest(new { error = result.Error });
        }

        return NoContent();
    }

    [Authorize(Policy = "OrganizerOnly")]
    [HttpDelete("api/events/{eventId:guid}/event-admins/{staffUserId:guid}")]
    public async Task<IActionResult> Unassign(Guid eventId, Guid staffUserId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var removed = await verification.UnassignAsync(eventId, staffUserId, userId.Value, IsPlatformAdmin());
        return removed ? NoContent() : NotFound();
    }

    [HttpPost("api/verification/validate")]
    public async Task<IActionResult> Validate([FromBody] TicketVerificationRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var result = await verification.ValidateByCodeAsync(request.TicketCode, userId.Value, IsPlatformAdmin());
        return result.Result == "Invalid" ? BadRequest(result) : Ok(result);
    }

    [HttpPost("api/verification/check-in")]
    public async Task<IActionResult> CheckIn([FromBody] TicketVerificationRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var result = await verification.CheckInAsync(request.TicketCode, userId.Value, IsPlatformAdmin());
        return result.Result switch
        {
            "Invalid" => BadRequest(result),
            "AlreadyUsed" => Conflict(result),
            _ => Ok(result)
        };
    }

    [HttpPost("api/verification/tickets/{ticketId:guid}/reverse")]
    public async Task<IActionResult> ReverseCheckIn(Guid ticketId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var reversed = await verification.ReverseCheckInAsync(ticketId, userId.Value, IsPlatformAdmin());
        return reversed ? Ok(new { ticketId, status = "Valid", message = "Check-in reversed." }) : NotFound();
    }

    [HttpGet("api/verification/events/{eventId:guid}/attendees")]
    public async Task<IActionResult> SearchAttendees(Guid eventId, [FromQuery] string? search)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var rows = await verification.SearchAttendeesAsync(eventId, userId.Value, IsPlatformAdmin(), search);
        return rows is null ? NotFound() : Ok(rows);
    }

    [HttpGet("api/verification/events/{eventId:guid}/summary")]
    public async Task<IActionResult> Summary(Guid eventId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var summary = await verification.GetSummaryAsync(eventId, userId.Value, IsPlatformAdmin());
        return summary is null ? NotFound() : Ok(summary);
    }

    private Guid? GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.TryParse(claim, out var userId) ? userId : null;
    }

    private bool IsPlatformAdmin() => User.IsInRole(nameof(UserRole.PlatformAdmin));
}
