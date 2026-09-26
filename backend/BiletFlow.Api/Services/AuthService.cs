using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using BiletFlow.Api.Data;
using BiletFlow.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace BiletFlow.Api.Services;

public sealed class AuthService(AuthDbContext db, IPasswordHasher<AppUser> passwordHasher, IConfiguration configuration, IHostEnvironment environment)
{
    private const int TokenLifetimeMinutes = 60;

    public async Task<(AppUser? User, string? VerificationToken, string? Error)> RegisterAsync(RegisterRequest request)
    {
        var email = NormalizeEmail(request.Email);
        if (!IsValidEmail(email) || !IsValidPassword(request.Password)) return (null, null, "A valid email and a password of at least 8 characters are required.");
        if (await db.Users.AnyAsync(user => user.Email == email)) return (null, null, "An account with this email already exists.");

        var user = new AppUser { Email = email, PasswordHash = string.Empty, Role = request.CreateOrganizerProfile ? UserRole.Organizer : UserRole.Attendee };
        user.PasswordHash = passwordHasher.HashPassword(user, request.Password);
        db.Users.Add(user);
        var rawToken = CreateRawToken();
        db.AuthTokens.Add(CreateToken(user.Id, AuthTokenType.EmailVerification, rawToken, TimeSpan.FromHours(24)));
        if (request.CreateOrganizerProfile)
        {
            var organizerName = email[..email.IndexOf('@')];
            db.OrganizerProfiles.Add(new OrganizerProfile
            {
                UserId = user.Id,
                BusinessName = organizerName,
                DisplayName = organizerName,
                ContactEmail = email
            });
        }

        await db.SaveChangesAsync();
        return (user, rawToken, null);
    }

    public async Task<(AuthResponse? Response, string? Error)> LoginAsync(LoginRequest request)
    {
        var user = await db.Users.SingleOrDefaultAsync(candidate => candidate.Email == NormalizeEmail(request.Email));
        if (user is null || user.IsSuspended) return (null, "Invalid email or password.");
        if (passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password) == PasswordVerificationResult.Failed) return (null, "Invalid email or password.");
        return (CreateAuthResponse(user), null);
    }

    public async Task<bool> VerifyEmailAsync(string rawToken)
    {
        var token = await FindUsableTokenAsync(rawToken, AuthTokenType.EmailVerification);
        if (token is null) return false;
        token.User.EmailConfirmed = true;
        token.UsedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<string?> CreatePasswordResetTokenAsync(string email)
    {
        var user = await db.Users.SingleOrDefaultAsync(candidate => candidate.Email == NormalizeEmail(email));
        if (user is null || user.IsSuspended) return null;
        var rawToken = CreateRawToken();
        db.AuthTokens.Add(CreateToken(user.Id, AuthTokenType.PasswordReset, rawToken, TimeSpan.FromMinutes(30)));
        await db.SaveChangesAsync();
        return rawToken;
    }

    public async Task<bool> ResetPasswordAsync(ResetPasswordRequest request)
    {
        if (!IsValidPassword(request.NewPassword)) return false;
        var token = await FindUsableTokenAsync(request.Token, AuthTokenType.PasswordReset);
        if (token is null) return false;
        token.User.PasswordHash = passwordHasher.HashPassword(token.User, request.NewPassword);
        token.UsedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
        return true;
    }

    public bool IsDevelopment => environment.IsDevelopment();

    private AuthResponse CreateAuthResponse(AppUser user)
    {
        var expiresAt = DateTimeOffset.UtcNow.AddMinutes(TokenLifetimeMinutes);
        var key = configuration["Jwt:SigningKey"] ?? throw new InvalidOperationException("Jwt:SigningKey is not configured.");
        var claims = new[] { new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()), new Claim(JwtRegisteredClaimNames.Email, user.Email), new Claim(ClaimTypes.Role, user.Role.ToString()), new Claim("email_verified", user.EmailConfirmed.ToString().ToLowerInvariant()) };
        var credentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256);
        var jwt = new JwtSecurityToken(claims: claims, expires: expiresAt.UtcDateTime, signingCredentials: credentials);
        return new AuthResponse(new JwtSecurityTokenHandler().WriteToken(jwt), expiresAt, user.Id, user.Email, user.Role.ToString(), user.EmailConfirmed);
    }

    private async Task<AuthToken?> FindUsableTokenAsync(string rawToken, AuthTokenType type) => await db.AuthTokens.Include(token => token.User).SingleOrDefaultAsync(token => token.Type == type && token.TokenHash == HashToken(rawToken) && token.UsedAt == null && token.ExpiresAt > DateTimeOffset.UtcNow);
    private static AuthToken CreateToken(Guid userId, AuthTokenType type, string rawToken, TimeSpan lifetime) => new() { UserId = userId, Type = type, TokenHash = HashToken(rawToken), ExpiresAt = DateTimeOffset.UtcNow.Add(lifetime) };
    private static string CreateRawToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
    private static string HashToken(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();
    private static bool IsValidEmail(string email) => email.Contains('@') && email.Length <= 320;
    private static bool IsValidPassword(string password) => !string.IsNullOrWhiteSpace(password) && password.Length >= 8;
}