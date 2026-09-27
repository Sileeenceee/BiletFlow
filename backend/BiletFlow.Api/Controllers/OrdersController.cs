using System.Security.Claims;
using BiletFlow.Api.Models;
using BiletFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BiletFlow.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/orders")]
public sealed class OrdersController(TicketingService ticketingService) : ControllerBase
{
    [HttpPost("checkout")]
    public async Task<IActionResult> Checkout([FromBody] CheckoutRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var result = await ticketingService.CheckoutAsync(userId.Value, request);
        if (result.Order is null)
        {
            return result.Conflict
                ? Conflict(new { error = result.Error })
                : BadRequest(new { error = result.Error });
        }

        return CreatedAtAction(nameof(GetById), new { orderId = result.Order.Id }, result.Order);
    }

    [HttpGet("me")]
    public async Task<IActionResult> GetMyOrders()
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        return Ok(await ticketingService.GetAttendeeOrdersAsync(userId.Value));
    }

    [HttpGet("{orderId:guid}")]
    public async Task<IActionResult> GetById(Guid orderId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var order = await ticketingService.GetOrderAsync(orderId, userId.Value, IsPlatformAdmin());
        return order is null ? NotFound() : Ok(order);
    }

    [HttpGet("/api/events/{eventId:guid}/orders")]
    [Authorize(Policy = "OrganizerOnly")]
    public async Task<IActionResult> GetEventOrders(Guid eventId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var orders = await ticketingService.GetEventOrdersAsync(eventId, userId.Value, IsPlatformAdmin());
        return orders is null ? NotFound() : Ok(orders);
    }

    [HttpGet("/api/tickets/{ticketId:guid}/qr")]
    public async Task<IActionResult> GetTicketQr(Guid ticketId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var qrImage = await ticketingService.GetTicketQrAsync(ticketId, userId.Value, IsPlatformAdmin());
        return qrImage is null ? NotFound() : File(qrImage, "image/png", $"ticket-{ticketId}.png");
    }

    private Guid? GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.TryParse(claim, out var userId) ? userId : null;
    }

    private bool IsPlatformAdmin() => User.IsInRole(nameof(UserRole.PlatformAdmin));
}
