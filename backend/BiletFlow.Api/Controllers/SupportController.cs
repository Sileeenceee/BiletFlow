using System.Security.Claims;
using BiletFlow.Api.Models;
using BiletFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BiletFlow.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/support")]
public sealed class SupportController(SupportService support) : ControllerBase
{
    [HttpGet("cases")]
    public async Task<IActionResult> GetCases()
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        return Ok(await support.GetCasesAsync(userId.Value, IsPlatformAdmin()));
    }

    [HttpPost("cases")]
    public async Task<IActionResult> Create([FromBody] CreateSupportCaseRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var result = await support.CreateAsync(userId.Value, request);
        if (result.Case is null) return BadRequest(new { error = result.Error });
        return CreatedAtAction(nameof(GetById), new { caseId = result.Case.Id }, result.Case);
    }

    [HttpGet("cases/{caseId:guid}")]
    public async Task<IActionResult> GetById(Guid caseId)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var supportCase = await support.GetCaseAsync(caseId, userId.Value, IsPlatformAdmin());
        return supportCase is null ? NotFound() : Ok(supportCase);
    }

    [HttpPost("cases/{caseId:guid}/messages")]
    public async Task<IActionResult> AddMessage(Guid caseId, [FromBody] CreateSupportMessageRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var result = await support.AddMessageAsync(caseId, userId.Value, request.Body, IsPlatformAdmin());
        if (result.Case is null)
        {
            return result.Error == "Support case not found."
                ? NotFound(new { error = result.Error })
                : Conflict(new { error = result.Error });
        }

        return Ok(result.Case);
    }

    [HttpPut("cases/{caseId:guid}")]
    public async Task<IActionResult> UpdateCase(Guid caseId, [FromBody] UpdateSupportCaseRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId is null) return Unauthorized();
        var result = await support.UpdateCaseAsync(caseId, userId.Value, IsPlatformAdmin(), request);
        if (result.Case is null)
        {
            return result.Error == "Support case not found."
                ? NotFound(new { error = result.Error })
                : result.Error == "You are not authorized to manage this support case."
                    ? Forbid()
                    : BadRequest(new { error = result.Error });
        }

        return Ok(result.Case);
    }

    private Guid? GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
        return Guid.TryParse(claim, out var userId) ? userId : null;
    }

    private bool IsPlatformAdmin() => User.IsInRole(nameof(UserRole.PlatformAdmin));
}
