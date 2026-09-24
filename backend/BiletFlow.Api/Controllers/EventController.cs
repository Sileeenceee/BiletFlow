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
    [HttpGet("me")]
    public async Task<IActionResult> GetMyEvents()
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var events = await eventService.GetOrganizerEventsAsync(userId.Value);
        return Ok(events);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateEventRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var result = await eventService.CreateAsync(userId.Value, request);
        if (result.Error is not null) return BadRequest(new { error = result.Error });

        return Created($"/api/events/{result.Event!.Id}", result.Event);
    }

    private Guid? GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.TryParse(claim, out var userId) ? userId : null;
    }
}
