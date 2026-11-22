using BiletFlow.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace BiletFlow.Api.Controllers;

[ApiController]
[Route("api/cities")]
[AllowAnonymous]
public sealed class CitiesController(EventService eventService) : ControllerBase
{
    /// <summary>City directory for event forms and the public city filter, sorted by name.</summary>
    [HttpGet]
    public async Task<IActionResult> GetCities() => Ok(await eventService.GetCitiesAsync());
}
