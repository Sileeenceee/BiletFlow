using System.Security.Claims;
using BiletFlow.Api.Models;
using BiletFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BiletFlow.Api.Controllers;

[ApiController]
[Route("api/events")]
[Authorize(Policy = "OrganizerOnly")]
public sealed class EventController(EventService eventService) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet]
    public async Task<IActionResult> GetPublishedEvents() =>
        Ok(await eventService.GetPublishedEventsAsync());

    [HttpGet("me")]
    public async Task<IActionResult> GetMyEvents()
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var events = await eventService.GetOrganizerEventsAsync(userId.Value);
        return Ok(events);
    }

    [AllowAnonymous]
    [HttpGet("{eventId:guid}")]
    public async Task<IActionResult> GetById(Guid eventId)
    {
        var ev = await eventService.GetEventAsync(eventId, GetCurrentUserId(), IsPlatformAdmin());
        return ev is null ? NotFound() : Ok(ev);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateEventRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var result = await eventService.CreateAsync(userId.Value, request);
        if (result.Error is not null) return BadRequest(new { error = result.Error });

        return CreatedAtAction(nameof(GetById), new { eventId = result.Event!.Id }, result.Event);
    }

    [HttpPut("{eventId:guid}")]
    public async Task<IActionResult> Update(Guid eventId, [FromBody] CreateEventRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var result = await eventService.UpdateAsync(eventId, userId.Value, IsPlatformAdmin(), request);
        if (result.Event is null)
        {
            return result.Error == "Event not found." ? NotFound(new { error = result.Error }) : BadRequest(new { error = result.Error });
        }

        return Ok(result.Event);
    }

    [HttpPost("{eventId:guid}/duplicate")]
    public async Task<IActionResult> Duplicate(Guid eventId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var result = await eventService.DuplicateAsync(eventId, userId.Value, IsPlatformAdmin());
        if (result.Event is null) return NotFound(new { error = result.Error });

        return CreatedAtAction(nameof(GetById), new { eventId = result.Event.Id }, result.Event);
    }

    [HttpPost("{eventId:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid eventId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var result = await eventService.CancelAsync(eventId, userId.Value, IsPlatformAdmin());
        if (result.Event is null) return NotFound(new { error = result.Error });

        return Ok(result.Event);
    }

    [HttpDelete("{eventId:guid}")]
    public async Task<IActionResult> Delete(Guid eventId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var result = await eventService.DeleteAsync(eventId, userId.Value, IsPlatformAdmin());
        if (!result.Deleted)
        {
            return result.Error == "Event not found."
                ? NotFound(new { error = result.Error })
                : Conflict(new { error = result.Error });
        }

        return NoContent();
    }

    private Guid? GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.TryParse(claim, out var userId) ? userId : null;
    }

    private bool IsPlatformAdmin() => User.IsInRole(nameof(UserRole.PlatformAdmin));
}
