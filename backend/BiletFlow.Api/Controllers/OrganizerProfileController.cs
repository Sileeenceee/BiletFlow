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

    [HttpPost("profile")]
    public async Task<IActionResult> CreateProfile([FromBody] OrganizerProfileRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var result = await profileService.CreateAsync(userId.Value, request);
        if (result.Error is not null)
        {
            return result.Error == "Organizer profile already exists."
                ? Conflict(new { error = result.Error })
                : BadRequest(new { error = result.Error });
        }

        return CreatedAtAction(nameof(GetProfile), null, result.Profile);
    }

    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] OrganizerProfileRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        var result = await profileService.UpdateAsync(userId.Value, request);
        if (result.Error is not null)
        {
            return result.Error == "Organizer profile not found."
                ? NotFound(new { error = result.Error })
                : BadRequest(new { error = result.Error });
        }

        return Ok(result.Profile);
    }

    [HttpDelete("profile")]
    public async Task<IActionResult> DeleteProfile()
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();

        return await profileService.DeleteAsync(userId.Value) ? NoContent() : NotFound();
    }

    private Guid? GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.TryParse(claim, out var userId) ? userId : null;
    }
}
