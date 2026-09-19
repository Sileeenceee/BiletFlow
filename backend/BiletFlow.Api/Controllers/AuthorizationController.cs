using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BiletFlow.Api.Controllers;

[ApiController]
public sealed class AuthorizationController : ControllerBase
{
    [Authorize(Policy = "OrganizerOnly")]
    [HttpGet("api/organizer/access-check")]
    public IActionResult OrganizerAccess() => Ok(new { message = "Organizer access granted." });

    [Authorize(Policy = "PlatformAdminOnly")]
    [HttpGet("api/admin/access-check")]
    public IActionResult PlatformAdminAccess() => Ok(new { message = "Platform admin access granted." });
}