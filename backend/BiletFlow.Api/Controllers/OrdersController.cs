using System.Security.Claims;
using BiletFlow.Api.Models;
using BiletFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BiletFlow.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/orders")]
public sealed class OrdersController(TicketingService ticketingService, TicketDocumentService ticketDocuments) : ControllerBase
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

    [HttpPut("{orderId:guid}")]
    public async Task<IActionResult> UpdatePendingOrder(Guid orderId, [FromBody] UpdateOrderRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var result = await ticketingService.UpdatePendingOrderAsync(orderId, userId.Value, request);
        return ToActionResult(result.Order, result.Error, result.Kind);
    }

    /// <summary>Payment simulation: body { "outcome": "succeeded" | "failed" }.</summary>
    [HttpPost("{orderId:guid}/pay")]
    public async Task<IActionResult> Pay(Guid orderId, [FromBody] PayOrderRequest? request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var result = await ticketingService.PayOrderAsync(orderId, userId.Value, request?.Outcome);
        return ToActionResult(result.Order, result.Error, result.Kind);
    }

    [HttpPost("{orderId:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid orderId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var result = await ticketingService.CancelOwnOrderAsync(orderId, userId.Value);
        return ToActionResult(result.Order, result.Error, result.Kind);
    }

    [HttpDelete("{orderId:guid}")]
    public async Task<IActionResult> DeletePendingOrder(Guid orderId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var result = await ticketingService.CancelOwnOrderAsync(orderId, userId.Value);
        if (result.Order is null)
        {
            return result.Kind switch
            {
                ServiceError.NotFound => NotFound(new { error = result.Error }),
                ServiceError.Conflict => Conflict(new { error = result.Error }),
                _ => BadRequest(new { error = result.Error })
            };
        }

        return NoContent();
    }

    [HttpPost("/api/events/{eventId:guid}/orders/{orderId:guid}/cancel")]
    [Authorize(Policy = "OrganizerOnly")]
    public async Task<IActionResult> CancelFreeOrder(Guid eventId, Guid orderId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var result = await ticketingService.CancelFreeOrderAsync(eventId, orderId, userId.Value, IsPlatformAdmin());
        return ToActionResult(result.Order, result.Error, result.Kind);
    }

    [HttpGet("/api/events/{eventId:guid}/attendees")]
    [Authorize(Policy = "OrganizerOnly")]
    public async Task<IActionResult> GetAttendees(Guid eventId, [FromQuery] string? search)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var attendees = await ticketingService.GetAttendeesAsync(eventId, userId.Value, IsPlatformAdmin(), search);
        return attendees is null ? NotFound() : Ok(attendees);
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

    [HttpGet("/api/tickets/{ticketId:guid}/pdf")]
    public async Task<IActionResult> GetTicketPdf(Guid ticketId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var pdf = await ticketDocuments.CreatePdfAsync(ticketId, userId.Value, IsPlatformAdmin());
        return pdf is null ? NotFound() : File(pdf, "application/pdf", $"ticket-{ticketId}.pdf");
    }

    private IActionResult ToActionResult(OrderResponse? order, string? error, ServiceError kind) => order is not null
        ? Ok(order)
        : kind switch
        {
            ServiceError.NotFound => NotFound(new { error }),
            ServiceError.Conflict => Conflict(new { error }),
            _ => BadRequest(new { error })
        };

    private Guid? GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.TryParse(claim, out var userId) ? userId : null;
    }

    private bool IsPlatformAdmin() => User.IsInRole(nameof(UserRole.PlatformAdmin));
}
