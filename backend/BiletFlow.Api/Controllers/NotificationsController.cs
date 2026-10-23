using System.Security.Claims;
using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BiletFlow.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/notifications")]
public sealed class NotificationsController(AuthDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetMine([FromQuery] bool unreadOnly = false)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var query = db.InAppNotifications.AsNoTracking()
            .Where(notification => notification.UserId == userId.Value);
        if (unreadOnly) query = query.Where(notification => notification.ReadAt == null);
        var notifications = await query.OrderByDescending(notification => notification.CreatedAt)
            .Take(100)
            .Select(notification => new InAppNotificationResponse(
                notification.Id, notification.Type, notification.Title, notification.Message,
                notification.RelatedCaseId, notification.CreatedAt, notification.ReadAt))
            .ToListAsync();
        return Ok(notifications);
    }

    [HttpPut("{notificationId:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid notificationId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var notification = await db.InAppNotifications.SingleOrDefaultAsync(candidate =>
            candidate.Id == notificationId && candidate.UserId == userId.Value);
        if (notification is null) return NotFound();
        notification.ReadAt ??= DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        return NoContent();
    }

    private Guid? GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.TryParse(claim, out var userId) ? userId : null;
    }
}
