using System.Security.Claims;
using BiletFlow.Api.Models;
using BiletFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BiletFlow.Api.Controllers;

[ApiController]
[Route("api/events/{eventId:guid}")]
[Authorize(Policy = "OrganizerOnly")]
public sealed class TicketTypesController(TicketingService ticketingService) : ControllerBase
{
    [AllowAnonymous]
    [HttpGet("ticket-types")]
    public async Task<IActionResult> Get(Guid eventId)
    {
        var userId = GetCurrentUserId();
        var ticketTypes = await ticketingService.GetTicketTypesAsync(eventId, userId, IsPlatformAdmin());
        return ticketTypes is null ? NotFound() : Ok(ticketTypes);
    }

    [HttpPost("ticket-types")]
    public async Task<IActionResult> Create(Guid eventId, [FromBody] CreateTicketTypeRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var result = await ticketingService.CreateTicketTypeAsync(userId.Value, IsPlatformAdmin(), eventId, request);
        if (result.TicketType is null)
        {
            return result.Error == "Event not found." ? NotFound(new { error = result.Error }) : BadRequest(new { error = result.Error });
        }

        return CreatedAtAction(nameof(Get), new { eventId }, result.TicketType);
    }

    [HttpPut("ticket-types/{ticketTypeId:guid}")]
    public async Task<IActionResult> Update(Guid eventId, Guid ticketTypeId, [FromBody] UpdateTicketTypeRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var result = await ticketingService.UpdateTicketTypeAsync(userId.Value, IsPlatformAdmin(), eventId, ticketTypeId, request);
        if (result.TicketType is null)
        {
            if (result.Error?.StartsWith("Inventory changed", StringComparison.Ordinal) == true)
            {
                return Conflict(new { error = result.Error });
            }

            return result.Error is "Event not found." or "Ticket type not found."
                ? NotFound(new { error = result.Error })
                : BadRequest(new { error = result.Error });
        }

        return Ok(result.TicketType);
    }

    [HttpPost("paid-sales/activate-simulation")]
    public async Task<IActionResult> ActivatePaidSales(Guid eventId, [FromBody] ActivatePaidSalesSimulationRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        if (!request.ConfirmSimulationOnly) return BadRequest(new { error = "Confirm that this is a simulation only." });

        var activated = await ticketingService.ActivatePaidSalesSimulationAsync(
            userId.Value,
            IsPlatformAdmin(),
            eventId,
            request.ConfirmSimulationOnly);
        if (!activated)
        {
            return BadRequest(new { error = "The event must exist, have at least one paid ticket type and not be suspended." });
        }

        return Ok(new { eventId, paidSalesActivated = true, paymentMode = "Simulation" });
    }

    private Guid? GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.TryParse(claim, out var userId) ? userId : null;
    }

    private bool IsPlatformAdmin() => User.IsInRole(nameof(UserRole.PlatformAdmin));
}
