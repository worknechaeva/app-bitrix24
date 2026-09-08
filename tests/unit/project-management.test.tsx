import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveProjectDraft } from "@/features/projects/project-draft";
import { ProjectManagement } from "@/features/projects/project-management";

const actions = vi.hoisted(() => ({
  reloadProjectListAction: vi.fn(),
  saveProjectAction: vi.fn(),
  searchProjectDirectoryAction: vi.fn(),
  setProjectArchivedAction: vi.fn(),
}));
vi.mock("@/features/projects/actions", () => actions);

const project = {
  id: "forma",
  ownerProfileId: "mock-editor",
  name: "Форма",
  websiteUrl: "https://forma.example",
  bitrixEntityId: "77",
  bitrixEntityType: "project" as const,
  bitrixEntityTitle: "Разработка CMS",
  requiredTag: "forma.example",
  defaultResponsibleId: "102",
  archived: false,
  canEdit: true,
  canArchive: true,
};
const entities = [{ id: "77", title: "Разработка CMS", type: "project" as const }];
const employees = [
  { id: "102", name: "Максим", lastName: "Орлов", position: "Разработчик", departmentIds: [] },
];

describe("project management", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it("offers repeated OAuth login when Directory credentials are unavailable", () => {
    render(
      <ProjectManagement
        initialProjects={[project]}
        entities={[]}
        employees={[]}
        actorProfileId="mock-editor"
        directoryStatus="reauth_required"
      />,
    );
    expect(screen.getByRole("link", { name: "войти повторно" })).toHaveAttribute(
      "href",
      "/api/bitrix24/oauth/start?return_path=%2Fprojects",
    );
    expect(screen.getByRole("button", { name: /Добавить проект/ })).toBeDisabled();
  });

  it("unlocks the form and preserves values when a save request is rejected", async () => {
    const user = userEvent.setup();
    actions.saveProjectAction.mockRejectedValueOnce(new Error("network failed"));
    render(
      <ProjectManagement
        initialProjects={[project]}
        entities={entities}
        employees={employees}
        actorProfileId="mock-editor"
        directoryStatus="available"
      />,
    );
    await user.click(screen.getByRole("button", { name: /Редактировать/ }));
    const name = screen.getByLabelText("Название *");
    await user.clear(name);
    await user.type(name, "Значение после сбоя");
    await user.click(screen.getByRole("button", { name: "Сохранить проект" }));

    expect(await screen.findByText("Результат сохранения неизвестен")).toBeInTheDocument();
    expect(name).toHaveValue("Значение после сбоя");
    expect(screen.getByRole("button", { name: "Сохранить проект" })).toBeEnabled();
  });

  it("unlocks search and preserves form values when a search request is rejected", async () => {
    const user = userEvent.setup();
    actions.searchProjectDirectoryAction.mockRejectedValueOnce(new Error("network failed"));
    render(
      <ProjectManagement
        initialProjects={[project]}
        entities={entities}
        employees={employees}
        actorProfileId="mock-editor"
        directoryStatus="available"
      />,
    );
    await user.click(screen.getByRole("button", { name: /Редактировать/ }));
    const name = screen.getByLabelText("Название *");
    await user.clear(name);
    await user.type(name, "Черновик поиска");
    await user.click(screen.getByRole("button", { name: "Найти проект Bitrix24" }));

    expect(await screen.findByText(/Не удалось выполнить поиск/)).toBeInTheDocument();
    expect(name).toHaveValue("Черновик поиска");
    expect(screen.getByRole("button", { name: "Найти проект Bitrix24" })).toBeEnabled();
  });

  it("reuses the creation operation key after an unknown result", async () => {
    const user = userEvent.setup();
    actions.saveProjectAction.mockRejectedValueOnce(new Error("connection lost")).mockResolvedValueOnce({
      status: "success",
      message: "Проект добавлен",
      projects: [project],
      refreshRequired: false,
    });
    render(
      <ProjectManagement
        initialProjects={[]}
        entities={entities}
        employees={employees}
        actorProfileId="mock-editor"
        directoryStatus="available"
      />,
    );
    await user.click(screen.getByRole("button", { name: /Добавить проект/ }));
    const submit = within(screen.getByTestId("project-form")).getByRole("button", {
      name: "Добавить проект",
    });
    await user.click(submit);
    await screen.findByText("Результат сохранения неизвестен");
    await user.click(submit);

    const [firstInput] = actions.saveProjectAction.mock.calls[0];
    const [secondInput] = actions.saveProjectAction.mock.calls[1];
    expect(firstInput.creationOperationKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondInput.creationOperationKey).toBe(firstInput.creationOperationKey);
  });

  it("offers to reload only the list after a confirmed save", async () => {
    const user = userEvent.setup();
    actions.saveProjectAction.mockResolvedValueOnce({
      status: "success",
      message: "Проект сохранен, но список не удалось обновить",
      projects: null,
      refreshRequired: true,
    });
    actions.reloadProjectListAction.mockResolvedValueOnce({
      status: "success",
      message: "Список проектов обновлен",
      projects: [{ ...project, name: "Обновленный проект" }],
      refreshRequired: false,
    });
    render(
      <ProjectManagement
        initialProjects={[project]}
        entities={entities}
        employees={employees}
        actorProfileId="mock-editor"
        directoryStatus="available"
      />,
    );
    await user.click(screen.getByRole("button", { name: /Редактировать/ }));
    await user.click(screen.getByRole("button", { name: "Сохранить проект" }));
    await waitFor(() => expect(actions.saveProjectAction).toHaveBeenCalledTimes(1));
    await user.click(await screen.findByRole("button", { name: "Обновить список" }));
    expect(await screen.findByText("Обновленный проект")).toBeInTheDocument();
    expect(actions.saveProjectAction).toHaveBeenCalledTimes(1);
    expect(actions.reloadProjectListAction).toHaveBeenCalledTimes(1);
  });

  it("reopens the same project and restores its draft after OAuth", async () => {
    saveProjectDraft({
      actorProfileId: "mock-editor",
      projectId: project.id,
      creationOperationKey: null,
      name: "Черновик названия",
      websiteUrl: "https://draft.example",
      requiredTag: "draft.example",
      bitrixEntityId: "77",
      defaultResponsibleId: "102",
    });
    render(
      <ProjectManagement
        initialProjects={[project]}
        entities={entities}
        employees={employees}
        actorProfileId="mock-editor"
        directoryStatus="available"
      />,
    );

    expect(await screen.findByText("Редактировать «Форма»")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Название *")).toHaveValue("Черновик названия"));
    expect(screen.getByLabelText("Адрес сайта")).toHaveValue("https://draft.example");
    expect(screen.getByLabelText("Обязательный тег *")).toHaveValue("draft.example");
  });
});
