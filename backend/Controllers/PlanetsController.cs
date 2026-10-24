using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PlanetLab.Api.Data;
using PlanetLab.Api.Models;

namespace PlanetLab.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PlanetsController : ControllerBase
{
    private readonly PlanetLabDbContext _context;

    public PlanetsController(PlanetLabDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<Planet>>> GetPlanets()
    {
        var planets = await _context.Planets
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync();

        return Ok(planets);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<Planet>> GetPlanet(int id)
    {
        var planet = await _context.Planets.FindAsync(id);

        if (planet is null)
        {
            return NotFound();
        }

        return Ok(planet);
    }

    [HttpPost]
    public async Task<ActionResult<Planet>> CreatePlanet(Planet planet)
    {
        planet.Id = 0;
        planet.CreatedAt = DateTime.UtcNow;

        _context.Planets.Add(planet);
        await _context.SaveChangesAsync();

        return CreatedAtAction(
            nameof(GetPlanet),
            new { id = planet.Id },
            planet);
    }
}