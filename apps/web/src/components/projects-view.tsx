"use client";
import "../styles/projects.css";

// Next loads this module only with the Projects route. Keeping its scene in the
// route chunk avoids a second download after session confirmation on cold entry.
export { ProjectsView } from "./projects-scene";
