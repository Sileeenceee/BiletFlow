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
    private const int RefreshTokenLifetimeDays = 7;

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
        return (await CreateAuthResponseAsync(user), null);
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
        // A new password ends every existing session, so a stolen refresh token stops working.
        await RevokeRefreshTokensAsync(token.User.Id);
        return true;
    }

    public async Task<AuthResponse?> RefreshAsync(string rawToken)
    {
        var tokenHash = HashToken(rawToken);
        var stored = await db.AuthTokens.Include(token => token.User)
            .SingleOrDefaultAsync(token => token.Type == AuthTokenType.RefreshToken && token.TokenHash == tokenHash);
        if (stored is null || stored.ExpiresAt <= DateTimeOffset.UtcNow) return null;

        // A refresh token works once. Seeing a used one again means it was copied,
        // so end every session of this user.
        if (stored.UsedAt is not null)
        {
            await RevokeRefreshTokensAsync(stored.UserId);
            return null;
        }

        if (stored.User.IsSuspended) return null;

        // Claim the token in one statement: of two parallel requests with the same token, only one gets 1 row.
        var claimed = await db.AuthTokens
            .Where(token => token.Id == stored.Id && token.UsedAt == null)
            .ExecuteUpdateAsync(set => set.SetProperty(token => token.UsedAt, (DateTimeOffset?)DateTimeOffset.UtcNow));
        return claimed == 1 ? await CreateAuthResponseAsync(stored.User) : null;
    }

    public async Task LogoutAsync(string rawToken)
    {
        var tokenHash = HashToken(rawToken);
        await db.AuthTokens
            .Where(token => token.Type == AuthTokenType.RefreshToken && token.TokenHash == tokenHash && token.UsedAt == null)
            .ExecuteUpdateAsync(set => set.SetProperty(token => token.UsedAt, (DateTimeOffset?)DateTimeOffset.UtcNow));
    }

    public Task<AppUser?> GetUserAsync(Guid userId) => db.Users.SingleOrDefaultAsync(user => user.Id == userId);

    public async Task<(AppUser? User, string? VerificationToken, string? Error)> UpdateAccountAsync(
        Guid userId, UpdateAccountRequest request)
    {
        var user = await db.Users.SingleOrDefaultAsync(candidate => candidate.Id == userId);
        if (user is null || user.IsSuspended) return (null, null, "User not found.");
        if (passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword) ==
            PasswordVerificationResult.Failed)
        {
            return (null, null, "Current password is incorrect.");
        }

        var emailChanged = request.Email is not null;
        if (emailChanged)
        {
            var email = NormalizeEmail(request.Email!);
            if (!IsValidEmail(email)) return (null, null, "A valid email address is required.");
            if (!string.Equals(email, user.Email, StringComparison.OrdinalIgnoreCase) &&
                await db.Users.AnyAsync(candidate => candidate.Email == email && candidate.Id != userId))
            {
                return (null, null, "An account with this email already exists.");
            }

            emailChanged = !string.Equals(email, user.Email, StringComparison.OrdinalIgnoreCase);
            if (emailChanged)
            {
                user.Email = email;
                user.EmailConfirmed = false;
            }
        }

        var passwordChanged = request.NewPassword is not null;
        if (passwordChanged)
        {
            if (!IsValidPassword(request.NewPassword!))
            {
                return (null, null, "New password must be at least 8 characters.");
            }

            user.PasswordHash = passwordHasher.HashPassword(user, request.NewPassword!);
        }

        if (!emailChanged && !passwordChanged)
        {
            return (null, null, "Provide a different email address or a new password.");
        }

        string? verificationToken = null;
        if (emailChanged)
        {
            await db.AuthTokens
                .Where(token => token.UserId == userId && token.Type == AuthTokenType.EmailVerification && token.UsedAt == null)
                .ExecuteUpdateAsync(set => set.SetProperty(token => token.UsedAt, (DateTimeOffset?)DateTimeOffset.UtcNow));
            verificationToken = CreateRawToken();
            db.AuthTokens.Add(CreateToken(userId, AuthTokenType.EmailVerification, verificationToken, TimeSpan.FromHours(24)));
        }

        if (emailChanged || passwordChanged) await RevokeRefreshTokensAsync(userId);
        await db.SaveChangesAsync();
        return (user, verificationToken, null);
    }

    public async Task<(bool Deleted, string? Error)> DeleteAccountAsync(Guid userId)
    {
        var user = await db.Users.SingleOrDefaultAsync(candidate => candidate.Id == userId);
        if (user is null) return (false, "User not found.");
        if (user.Role == UserRole.PlatformAdmin)
        {
            return (false, "Platform administrator accounts cannot be self-deleted.");
        }

        if (await db.Orders.AnyAsync(order => order.AttendeeId == userId) ||
            await db.Events.AnyAsync(ev => ev.OrganizerId == userId) ||
            await db.SupportCases.AnyAsync(supportCase =>
                supportCase.RequesterUserId == userId || supportCase.AssignedToUserId == userId) ||
            await db.SupportMessages.AnyAsync(message => message.SenderUserId == userId) ||
            await db.PromoCampaigns.AnyAsync(campaign => campaign.CreatedByUserId == userId) ||
            await db.EventAdminAssignments.AnyAsync(assignment =>
                assignment.UserId == userId || assignment.AssignedByUserId == userId) ||
            await db.TicketCheckIns.AnyAsync(checkIn =>
                checkIn.CheckedInByUserId == userId || checkIn.ReversedByUserId == userId))
        {
            return (false, "Account has retained event, order, check-in, or support history. Contact support to preserve required records.");
        }

        db.Users.Remove(user);
        await db.SaveChangesAsync();
        return (true, null);
    }

    public bool IsDevelopment => environment.IsDevelopment();

    private async Task<AuthResponse> CreateAuthResponseAsync(AppUser user)
    {
        var refreshToken = CreateRawToken();
        db.AuthTokens.Add(CreateToken(user.Id, AuthTokenType.RefreshToken, refreshToken, TimeSpan.FromDays(RefreshTokenLifetimeDays)));
        await db.SaveChangesAsync();

        var expiresAt = DateTimeOffset.UtcNow.AddMinutes(TokenLifetimeMinutes);
        var key = configuration["Jwt:SigningKey"] ?? throw new InvalidOperationException("Jwt:SigningKey is not configured.");
        var claims = new[] { new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()), new Claim(JwtRegisteredClaimNames.Email, user.Email), new Claim(ClaimTypes.Role, user.Role.ToString()), new Claim("email_verified", user.EmailConfirmed.ToString().ToLowerInvariant()) };
        var credentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256);
        var jwt = new JwtSecurityToken(claims: claims, expires: expiresAt.UtcDateTime, signingCredentials: credentials);
        return new AuthResponse(new JwtSecurityTokenHandler().WriteToken(jwt), expiresAt, user.Id, user.Email, user.Role.ToString(), user.EmailConfirmed, refreshToken);
    }

    private Task<int> RevokeRefreshTokensAsync(Guid userId) => db.AuthTokens
        .Where(token => token.UserId == userId && token.Type == AuthTokenType.RefreshToken && token.UsedAt == null)
        .ExecuteUpdateAsync(set => set.SetProperty(token => token.UsedAt, (DateTimeOffset?)DateTimeOffset.UtcNow));

    private async Task<AuthToken?> FindUsableTokenAsync(string rawToken, AuthTokenType type) => await db.AuthTokens.Include(token => token.User).SingleOrDefaultAsync(token => token.Type == type && token.TokenHash == HashToken(rawToken) && token.UsedAt == null && token.ExpiresAt > DateTimeOffset.UtcNow);
    private static AuthToken CreateToken(Guid userId, AuthTokenType type, string rawToken, TimeSpan lifetime) => new() { UserId = userId, Type = type, TokenHash = HashToken(rawToken), ExpiresAt = DateTimeOffset.UtcNow.Add(lifetime) };
    private static string CreateRawToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
    private static string HashToken(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();
    private static bool IsValidEmail(string email) => email.Contains('@') && email.Length <= 320;
    private static bool IsValidPassword(string password) => !string.IsNullOrWhiteSpace(password) && password.Length >= 8;
}