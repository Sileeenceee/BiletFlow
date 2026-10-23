using System.Security.Claims;
using BiletFlow.Api.Models;
using BiletFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BiletFlow.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(AuthService service) : ControllerBase
{
    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest request)
    {
        var result = await service.RegisterAsync(request);
        if (result.Error is not null) return BadRequest(new { error = result.Error });

        return Created($"/api/auth/users/{result.User!.Id}", new
        {
            result.User.Id,
            result.User.Email,
            Role = result.User.Role.ToString(),
            result.User.EmailConfirmed,
            VerificationToken = service.IsDevelopment ? result.VerificationToken : null
        });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var result = await service.LoginAsync(request);
        return result.Response is null ? Unauthorized() : Ok(result.Response);
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh(RefreshRequest request)
    {
        var response = await service.RefreshAsync(request.RefreshToken);
        return response is null ? Unauthorized() : Ok(response);
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout(RefreshRequest request)
    {
        await service.LogoutAsync(request.RefreshToken);
        return NoContent();
    }

    [HttpPost("verify-email")]
    public async Task<IActionResult> VerifyEmail(VerifyEmailRequest request) =>
        await service.VerifyEmailAsync(request.Token)
            ? Ok(new { message = "Email verified." })
            : BadRequest(new { error = "The verification token is invalid or expired." });

    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request)
    {
        var token = await service.CreatePasswordResetTokenAsync(request.Email);
        return Ok(new
        {
            message = "If an account exists, password reset instructions have been issued.",
            ResetToken = service.IsDevelopment ? token : null
        });
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request) =>
        await service.ResetPasswordAsync(request)
            ? Ok(new { message = "Password reset." })
            : BadRequest(new { error = "The reset token is invalid, expired, or the password is too short." });

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        // Read the database, not the token: role and email status in a token are frozen at sign-in.
        var userIdText = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(userIdText, out var userId)) return Unauthorized();

        var user = await service.GetUserAsync(userId);
        if (user is null || user.IsSuspended) return Unauthorized();

        return Ok(new
        {
            UserId = user.Id,
            user.Email,
            Role = user.Role.ToString(),
            user.EmailConfirmed
        });
    }

    [Authorize]
    [HttpPut("me")]
    public async Task<IActionResult> UpdateMe([FromBody] UpdateAccountRequest request)
    {
        var userIdText = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(userIdText, out var userId)) return Unauthorized();

        var result = await service.UpdateAccountAsync(userId, request);
        if (result.User is null)
        {
            return result.Error == "User not found."
                ? NotFound(new { error = result.Error })
                : BadRequest(new { error = result.Error });
        }

        return Ok(new
        {
            UserId = result.User.Id,
            result.User.Email,
            Role = result.User.Role.ToString(),
            result.User.EmailConfirmed,
            VerificationToken = service.IsDevelopment ? result.VerificationToken : null
        });
    }

    [Authorize]
    [HttpDelete("me")]
    public async Task<IActionResult> DeleteMe()
    {
        var userIdText = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        if (!Guid.TryParse(userIdText, out var userId)) return Unauthorized();

        var result = await service.DeleteAccountAsync(userId);
        if (result.Deleted) return NoContent();
        return result.Error == "User not found."
            ? NotFound(new { error = result.Error })
            : Conflict(new { error = result.Error });
    }
}