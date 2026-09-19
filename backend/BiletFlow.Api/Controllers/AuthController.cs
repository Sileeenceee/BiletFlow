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
    public IActionResult Me() => Ok(new
    {
        UserId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value,
        Email = User.FindFirst(ClaimTypes.Email)?.Value,
        Role = User.FindFirst(ClaimTypes.Role)?.Value,
        EmailConfirmed = User.FindFirst("email_verified")?.Value == "true"
    });
}