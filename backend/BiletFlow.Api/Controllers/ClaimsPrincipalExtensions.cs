using System.Security.Claims;
using BiletFlow.Api.Models;

namespace BiletFlow.Api.Controllers;

public static class ClaimsPrincipalExtensions
{
    public static Guid? GetUserId(this ClaimsPrincipal user)
    {
        var claim = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        return Guid.TryParse(claim, out var userId) ? userId : null;
    }

    public static bool IsPlatformAdmin(this ClaimsPrincipal user) => user.IsInRole(nameof(UserRole.PlatformAdmin));
}
