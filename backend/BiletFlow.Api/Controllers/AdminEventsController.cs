using System.Security.Claims;
using BiletFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BiletFlow.Api.Controllers;

[ApiController]
[Route("api/admin/events")]
[Authorize(Policy = "PlatformAdminOnly")]
public sealed class AdminEventsController(TicketingService ticketingService) : ControllerBase
{
    [HttpPost("{eventId:guid}/paid-sales/suspend")]
    public async Task<IActionResult> SuspendPaidSales(Guid eventId)
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(claim, out var adminId)) return Unauthorized();

        var suspended = await ticketingService.SuspendPaidSalesAsync(adminId, eventId);
        return suspended
            ? Ok(new { eventId, paidSalesStatus = "Suspended", paidSalesActivated = false })
            : NotFound(new { error = "Event not found." });
    }
}
