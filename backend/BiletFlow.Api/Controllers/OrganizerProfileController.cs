using System.Security.Claims;
using BiletFlow.Api.Models;
using BiletFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BiletFlow.Api.Controllers;

[ApiController]
[Route("api/organizer")]
[Authorize(Policy = "OrganizerOnly")]
public sealed class OrganizerProfileController(OrganizerProfileService profileService) : ControllerBase
{
    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile()
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var profile = await profileService.GetByUserIdAsync(userId.Value);
        return profile is null ? NotFound(new { error = "Organizer profile not found." }) : Ok(profile);
    }

    [HttpPut("profile")]
    public async Task<IActionResult> UpsertProfile([FromBody] OrganizerProfileRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var result = await profileService.CreateOrUpdateAsync(userId.Value, request);
        if (result.Error is not null) return BadRequest(new { error = result.Error });

        return Ok(result.Profile);
    }

    private Guid? GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.TryParse(claim, out var userId) ? userId : null;
    }
}
