"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

const PlanetScene = dynamic(() => import("./PlanetScene"), {
  ssr: false,
  loading: () => <div className="planet-scene-loading" aria-label="Loading planet preview" />,
});

const planetOptions = {
  temperature: ["Frozen", "Temperate", "Scorching"],
  gravity: ["Low", "Earth-like", "High"],
  atmosphere: ["Thin", "Breathable", "Dense"],
  water: ["None", "Surface oceans", "Subsurface oceans"],
} as const;

type PlanetProperty = keyof typeof planetOptions;
type PlanetSelections = Record<PlanetProperty, number>;

type SavedPlanet = {
  id: number;
  name: string;
  temperature: number;
  gravity: number;
  atmosphere: number;
  water: number;
  createdAt: string;
};

const planetsApiUrl = "http://localhost:5269/api/planets";

const initialSelections: PlanetSelections = {
  temperature: 50,
  gravity: 50,
  atmosphere: 50,
  water: 50,
};

const optionLabels: Record<keyof PlanetSelections, string> = {
  temperature: "Temperature",
  gravity: "Gravity",
  atmosphere: "Atmosphere",
  water: "Water",
};

export default function Home() {
  const [selections, setSelections] = useState<PlanetSelections>(initialSelections);
  const [planetSeed, setPlanetSeed] = useState(741);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [planetName, setPlanetName] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedPlanets, setSavedPlanets] = useState<SavedPlanet[]>([]);
  const [isLoadingPlanets, setIsLoadingPlanets] = useState(true);
  const [planetsError, setPlanetsError] = useState("");
  const savingRef = useRef(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setReducedMotion(preference.matches);
    updateMotionPreference();
    preference.addEventListener("change", updateMotionPreference);
    return () => preference.removeEventListener("change", updateMotionPreference);
  }, []);

  const fetchSavedPlanets = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(planetsApiUrl, { signal });
    if (!response.ok) {
      throw new Error(`Could not load saved planets (HTTP ${response.status}).`);
    }
    const planets = (await response.json()) as SavedPlanet[];
    if (!Array.isArray(planets)) {
      throw new Error("The backend returned an unexpected planets response.");
    }
    return planets;
  }, []);

  function retryLoadSavedPlanets() {
    setIsLoadingPlanets(true);
    setPlanetsError("");
    void fetchSavedPlanets()
      .then(setSavedPlanets)
      .catch((error: unknown) => {
        setPlanetsError(error instanceof Error ? error.message : "Could not load saved planets.");
      })
      .finally(() => setIsLoadingPlanets(false));
  }

  useEffect(() => {
    const controller = new AbortController();
    void fetchSavedPlanets(controller.signal)
      .then(setSavedPlanets)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setPlanetsError(error instanceof Error ? error.message : "Could not load saved planets.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingPlanets(false);
      });
    return () => controller.abort();
  }, [fetchSavedPlanets]);

  function selectionLabel(property: PlanetProperty, value: number) {
    const index = value < 34 ? 0 : value < 67 ? 1 : 2;
    return planetOptions[property][index];
  }


  async function createPlanetConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;

    const name = planetName.trim();
    if (!name) {
      setSaveStatus("Please enter a planet name.");
      return;
    }
    if (name.length > 60) {
      setSaveStatus("Planet names must be 60 characters or fewer.");
      return;
    }

    savingRef.current = true;
    setIsSaving(true);
    setSaveStatus("Saving planet…");

    try {
      const response = await fetch(planetsApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ...selections }),
      });
      const responseText = await response.text();
      let responseBody: { name?: string; title?: string; detail?: string; errors?: Record<string, string[]> } | undefined;
      if (responseText) {
        try {
          responseBody = JSON.parse(responseText) as typeof responseBody;
        } catch {
          // Use the HTTP status if the server does not return a JSON error body.
        }
      }

      if (!response.ok) {
        const validationErrors = responseBody?.errors
          ? Object.values(responseBody.errors).flat().join(" ")
          : "";
        throw new Error(
          validationErrors || responseBody?.detail || responseBody?.title ||
          `The backend rejected the save (HTTP ${response.status}).`,
        );
      }

      setPlanetName("");
      setSaveStatus(`“${responseBody?.name ?? name}” saved successfully.`);
      const refreshedPlanets = await fetchSavedPlanets();
      setSavedPlanets(refreshedPlanets);
      setPlanetsError("");
    } catch (error) {
      console.error("Could not save planet:", error);
      const message = error instanceof Error ? error.message : "Unknown network error.";
      setSaveStatus(
        message === "Failed to fetch"
          ? "Could not reach the backend. Confirm it is running at http://localhost:5269 and allows this frontend origin."
          : message,
      );
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }


  function randomizePlanet() {
    const randomInRange = (minimum: number, maximum: number) =>
      Math.round((minimum + Math.random() * (maximum - minimum)) * 10) / 10;
    const worlds = [
      { temperature: [0, 25], gravity: [15, 82], atmosphere: [8, 68], water: [40, 100] },
      { temperature: [30, 68], gravity: [18, 88], atmosphere: [30, 92], water: [58, 100] },
      { temperature: [76, 100], gravity: [20, 94], atmosphere: [12, 82], water: [0, 42] },
      { temperature: [38, 88], gravity: [8, 90], atmosphere: [0, 38], water: [0, 18] },
      { temperature: [24, 78], gravity: [22, 80], atmosphere: [72, 100], water: [36, 92] },
    ] as const;
    const world = worlds[Math.floor(Math.random() * worlds.length)];

    setSelections({
      temperature: randomInRange(world.temperature[0], world.temperature[1]),
      gravity: randomInRange(world.gravity[0], world.gravity[1]),
      atmosphere: randomInRange(world.atmosphere[0], world.atmosphere[1]),
      water: randomInRange(world.water[0], world.water[1]),
    });
    setPlanetSeed(Math.floor(Math.random() * 2_147_483_646) + 1);
    setSaveStatus("");
  }

  return (
    <main className="landing-page" id="project">
      <div className="site-shell">
        <header className="site-header">
          <a className="wordmark" href="#project" aria-label="Planet Lab home">
            <svg
              className="wordmark-icon"
              viewBox="0 0 32 32"
              role="img"
              aria-label=""
            >
              <circle cx="16" cy="16" r="7.2" />
              <ellipse cx="16" cy="16" rx="14" ry="5.2" transform="rotate(-28 16 16)" />
              <circle className="wordmark-star" cx="25.8" cy="9.1" r="1.25" />
            </svg>
            <span>PLANET LAB</span>
          </a>

          <nav className="main-nav" aria-label="Main navigation">
            <a href="#project">THE PROJECT</a>
            <a href="#design-your-world">EXPLORE</a>
          </nav>
        </header>

        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><span /> AN EXPERIMENT IN WORLDBUILDING</p>
            <h1 id="hero-title">
              Somewhere,
              <br />
              a new world
              <br />
              <span>is waiting.</span>
            </h1>
            <p className="hero-description">
              Shape an unfamiliar planet, explore its atmosphere, and discover
              what might live there.
            </p>
            <a className="create-link" href="#design-your-world">
              <span>Create a planet</span>
              <span className="button-arrow" aria-hidden="true">↗</span>
            </a>
            <p className="hero-note">A universe of your own making <span>·</span> 01 / ∞</p>
          </div>

          <div
            className="planet-stage"
            id="explore"
            aria-label={`Procedurally textured 3D planet preview. Temperature ${selections.temperature}, gravity ${selections.gravity}, atmosphere ${selections.atmosphere}, water ${selections.water}. Artistic visualization, not a simulation.`}
          >
            <div className="stage-coordinate coordinate-top">41° 08′ N <span>•</span> 07° 26′ E</div>
            <div className="orbit orbit-outer" />
            <div className="orbit orbit-inner" />
            <PlanetScene values={selections} reducedMotion={reducedMotion} seed={planetSeed} />
            <div className="planet-ring" />
            <div className="moon" />
            <span className="stage-star star-one">✳</span>
            <span className="stage-star star-two">✦</span>
            <span className="stage-star star-three">·</span>
            <div className="stage-coordinate coordinate-bottom">FIG. 01 <span>—</span> ORBITAL STUDY</div>
            <div className="stage-index"><span>PL</span> / 001</div>
          </div>
        </section>

        <section className="design-section" id="design-your-world" aria-labelledby="design-title">
          <div className="design-heading">
            <p className="eyebrow"><span /> BEGIN WITH THE CONDITIONS</p>
            <h2 id="design-title">Design your world.</h2>
            <p>Choose the conditions that will shape your planet.</p>
          </div>

          <div className="design-tools">
            <p className="design-tool-note">Adjust the sliders to shape the conditions of your world.</p>
            <button className="utility-button" type="button" onClick={randomizePlanet}>
              <span aria-hidden="true">⤨</span> Randomize
            </button>
          </div>

          <div className="option-grid">
            {(Object.keys(planetOptions) as Array<keyof PlanetSelections>).map((group) => (
              <fieldset className="option-group" key={group}>
                <legend className="slider-heading">
                  <span>{optionLabels[group]}</span>
                  <output htmlFor={`${group}-slider`} className="slider-current-value">
                    {selectionLabel(group, selections[group])} · {selections[group]}
                  </output>
                </legend>
                <input
                  className="planet-slider"
                  id={`${group}-slider`}
                  type="range"
                  min="0"
                  max="100"
                  step="0.1"
                  value={selections[group]}
                  aria-label={optionLabels[group]}
                  aria-valuetext={`${selectionLabel(group, selections[group])}, ${selections[group]} out of 100`}
                  onChange={(event) => {
                    const nextValue = Number(event.currentTarget.value);
                    setSelections((current) => ({ ...current, [group]: nextValue }));
                  }}
                  style={{ "--slider-progress": `${selections[group]}%` } as CSSProperties}
                />
                <div className="slider-ticks" aria-hidden="true">
                  {planetOptions[group].map((option) => (
                    <span key={option}>{option}</span>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <div className="profile-row">
            <section className="planet-profile" aria-labelledby="profile-title">
              <div className="profile-heading">
                <span className="profile-index">PL / PROFILE</span>
                <h3 id="profile-title">Planet Profile</h3>
              </div>
              <dl className="profile-values" aria-live="polite">
                {(Object.keys(planetOptions) as Array<keyof PlanetSelections>).map((group) => (
                  <div className="profile-value" key={group}>
                    <dt>{optionLabels[group]}</dt>
                    <dd>{selectionLabel(group, selections[group])} <span>{selections[group]}</span></dd>
                  </div>
                ))}
              </dl>
              <p className="design-note">An artistic interpretation of your selected conditions — not a physical simulation.</p>
            </section>

            <div className="create-panel">
              <form className="planet-save-form" onSubmit={createPlanetConfiguration}>
                <label htmlFor="planet-name">Planet name</label>
                <input
                  id="planet-name"
                  type="text"
                  value={planetName}
                  onChange={(event) => setPlanetName(event.target.value)}
                  placeholder="e.g. Ocean World"
                  minLength={1}
                  maxLength={60}
                  required
                  disabled={isSaving}
                  aria-describedby="save-status"
                />
                <button className="create-config-button" type="submit" disabled={isSaving}>
                  {isSaving ? "Saving…" : "Create a planet"}
                  <span aria-hidden="true">{isSaving ? "◌" : "↗"}</span>
                </button>
                <p
                  className={`save-status${saveStatus && !isSaving && !saveStatus.includes("saved successfully") ? " is-error" : ""}`}
                  id="save-status"
                  role={saveStatus && !isSaving && !saveStatus.includes("saved successfully") ? "alert" : "status"}
                  aria-live={saveStatus && !isSaving && !saveStatus.includes("saved successfully") ? "assertive" : "polite"}
                >
                  {saveStatus}
                </p>
              </form>
            </div>
          </div>
        </section>

        <section className="saved-planets-section" aria-labelledby="saved-planets-title">
          <div className="saved-planets-heading">
            <div>
              <p className="eyebrow"><span /> YOUR EXPLORATION LOG</p>
              <h2 id="saved-planets-title">My Planets</h2>
            </div>
            {!isLoadingPlanets && !planetsError && (
              <span className="saved-planet-count">{savedPlanets.length.toString().padStart(2, "0")} WORLDS</span>
            )}
          </div>

          {isLoadingPlanets ? (
            <p className="saved-planets-message" role="status">Loading your saved planets…</p>
          ) : planetsError ? (
            <div className="saved-planets-message saved-planets-error" role="alert">
              <p>{planetsError}</p>
              <button className="utility-button" type="button" onClick={retryLoadSavedPlanets}>
                Try again
              </button>
            </div>
          ) : savedPlanets.length === 0 ? (
            <p className="saved-planets-message">No planets saved yet. Create your first world above.</p>
          ) : (
            <div className="saved-planets-grid">
              {savedPlanets.map((planet) => (
                <article className="saved-planet-card" key={planet.id}>
                  <div className="saved-planet-card-heading">
                    <h3>{planet.name}</h3>
                    <time dateTime={planet.createdAt}>
                      {new Date(planet.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  </div>
                  <dl className="saved-planet-conditions">
                    {(["temperature", "gravity", "atmosphere", "water"] as const).map((property) => (
                      <div key={property}>
                        <dt>{optionLabels[property]}</dt>
                        <dd>
                          {selectionLabel(property, planet[property])}
                          <span>{planet[property].toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
          )}
        </section>

        <footer className="page-footer">
          <span>AN OPEN ATLAS OF WORLDS THAT COULD BE</span>
          <span className="footer-mark"><i /> FIELD NOTES · VOL. 01</span>
        </footer>
      </div>
    </main>
  );
}
