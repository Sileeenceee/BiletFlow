using System.Security.Claims;
using BiletFlow.Api.Models;
using BiletFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BiletFlow.Api.Controllers;

[ApiController]
public sealed class PromoCampaignController(PromoCampaignService campaigns) : ControllerBase
{
    [Authorize(Policy = "OrganizerOnly")]
    [HttpGet("api/events/{eventId:guid}/campaigns")]
    public async Task<IActionResult> GetForEvent(Guid eventId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var result = await campaigns.GetForEventAsync(eventId, userId.Value, IsPlatformAdmin());
        return result is null ? NotFound() : Ok(result);
    }

    [Authorize(Policy = "OrganizerOnly")]
    [HttpGet("api/events/{eventId:guid}/campaign-analytics")]
    public async Task<IActionResult> GetAnalytics(Guid eventId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var result = await campaigns.GetAnalyticsAsync(eventId, userId.Value, IsPlatformAdmin());
        return result is null ? NotFound() : Ok(result);
    }

    [Authorize(Policy = "OrganizerOnly")]
    [HttpPost("api/events/{eventId:guid}/campaigns")]
    public async Task<IActionResult> Create(Guid eventId, [FromBody] CreatePromoCampaignRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var result = await campaigns.CreateAsync(eventId, userId.Value, IsPlatformAdmin(), request);
        if (result.Campaign is null)
        {
            return result.Error == "Event not found."
                ? NotFound(new { error = result.Error })
                : result.Error == "Promo code already exists."
                    ? Conflict(new { error = result.Error })
                    : BadRequest(new { error = result.Error });
        }

        return CreatedAtAction(nameof(GetForEvent), new { eventId }, result.Campaign);
    }

    [Authorize(Policy = "OrganizerOnly")]
    [HttpPut("api/events/{eventId:guid}/campaigns/{campaignId:guid}")]
    public async Task<IActionResult> Update(
        Guid eventId, Guid campaignId, [FromBody] CreatePromoCampaignRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var result = await campaigns.UpdateAsync(eventId, campaignId, userId.Value, IsPlatformAdmin(), request);
        if (result.Campaign is null)
        {
            return result.Error is "Event not found." or "Promo campaign not found."
                ? NotFound(new { error = result.Error })
                : result.Error == "Promo code already exists."
                    ? Conflict(new { error = result.Error })
                    : BadRequest(new { error = result.Error });
        }

        return Ok(result.Campaign);
    }

    [Authorize(Policy = "OrganizerOnly")]
    [HttpDelete("api/events/{eventId:guid}/campaigns/{campaignId:guid}")]
    public async Task<IActionResult> Delete(Guid eventId, Guid campaignId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var result = await campaigns.DeleteAsync(eventId, campaignId, userId.Value, IsPlatformAdmin());
        if (!result.Deleted)
        {
            return result.Error is "Event not found." or "Promo campaign not found."
                ? NotFound(new { error = result.Error })
                : Conflict(new { error = result.Error });
        }

        return NoContent();
    }

    [Authorize(Policy = "OrganizerOnly")]
    [HttpGet("api/events/{eventId:guid}/campaigns/{campaignId:guid}/qr")]
    public async Task<IActionResult> GetQr(Guid eventId, Guid campaignId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var qr = await campaigns.GetCampaignQrAsync(eventId, campaignId, userId.Value, IsPlatformAdmin());
        return qr is null ? NotFound() : File(qr, "image/png", $"campaign-{campaignId}.png");
    }

    [AllowAnonymous]
    [HttpGet("api/campaigns/resolve/{token}")]
    public async Task<IActionResult> Resolve(string token)
    {
        var result = await campaigns.ResolveAsync(token);
        return result.Campaign is null
            ? BadRequest(new { error = result.Error })
            : Ok(result.Campaign);
    }

    private Guid? GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.TryParse(claim, out var userId) ? userId : null;
    }

    private bool IsPlatformAdmin() => User.IsInRole(nameof(UserRole.PlatformAdmin));
}
