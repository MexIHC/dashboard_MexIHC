import { createContext, useContext, useMemo } from "react";

export type ProjectProfile = "ux_usability";

export type Project = {
  id: string;
  name: string;
  profile: ProjectProfile;
};

type ProjectsContextValue = {
  projects: Project[];
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  createProject: (name: string, profile?: ProjectProfile) => Project | null;
};

const MEXIHC_PROJECT: Project = { id: "mexihc", name: "MexIHC", profile: "ux_usability" };

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function isProjectVisible(id: string): boolean {
  return id === MEXIHC_PROJECT.id;
}

export function visibleProjects(projects: Project[]): Project[] {
  return projects.filter((p) => isProjectVisible(p.id));
}

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo(
    () => ({
      projects: [MEXIHC_PROJECT],
      activeProjectId: MEXIHC_PROJECT.id,
      setActiveProjectId: () => {},
      createProject: () => null,
    }),
    [],
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used within ProjectsProvider");
  return ctx;
}
