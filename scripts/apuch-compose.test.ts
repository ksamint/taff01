import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps Taff isolated while using the private PostgreSQL server and shared TLS proxy", () => {
  const exampleDatabase = readFileSync(".env.production.example", "utf8").match(
    /^DATABASE_URL=(.+)$/m,
  )?.[1];
  expect(exampleDatabase).toBeDefined();
  const exampleUrl = new URL(exampleDatabase ?? "");
  expect(exampleUrl.hostname).toBe("postgres01.internal.apuch.art");
  expect(exampleUrl.searchParams.get("sslmode")).toBe("verify-full");
  const database =
    "postgres://taff:compose-test@postgres01.internal.apuch.art:5432/taff?sslmode=verify-full";
  const config = JSON.parse(
    execFileSync(
      "docker",
      [
        "compose",
        "--env-file",
        ".env.production.example",
        "-f",
        "compose.prod.yaml",
        "-f",
        "compose.apuch.yaml",
        "config",
        "--format",
        "json",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: database,
          AUTH_URL: "https://taff.apuch.cn",
          AUTH_SECRET: "compose-test-secret-with-at-least-32-characters",
          TOKEN_PEPPER: "compose-test-pepper",
          POSTGRES_PASSWORD: "compose-test-unused",
          POSTGRES_CA_FILE: "/srv/taff/secrets/postgresql-ca.crt",
          COMPOSE_PROFILES: "",
        },
      },
    ),
  );
  expect(config.services.postgres).toBeUndefined();
  expect(config.services.migrate.depends_on ?? {}).toEqual({});
  for (const service of ["migrate", "api", "worker"]) {
    expect(config.services[service].environment.DATABASE_URL).toBe(database);
    expect(config.services[service].extra_hosts).toEqual([
      "postgres01.internal.apuch.art=10.206.103.13",
    ]);
    expect(config.services[service].environment.NODE_EXTRA_CA_CERTS).toBe(
      "/run/secrets/postgresql-ca.crt",
    );
    expect(config.services[service].volumes).toContainEqual(
      expect.objectContaining({
        type: "bind",
        source: "/srv/taff/secrets/postgresql-ca.crt",
        target: "/run/secrets/postgresql-ca.crt",
        read_only: true,
      }),
    );
  }
  expect(config.services.api.environment.AUTH_URL).toBe(
    "https://taff.apuch.cn",
  );
  for (const service of ["api", "worker", "web", "valkey", "caddy"])
    expect(config.services[service].ports ?? []).toEqual([]);
  expect(config.services.worker.build.args.TARGET).toBe("worker");
  expect(config.services.caddy.environment.SITE_ADDRESS).toBe(":80");
  expect(config.services.caddy.networks.edge.aliases).toContain("taff-caddy");
  expect(config.networks.edge).toMatchObject({
    external: true,
    name: "tableai-can01-edge",
  });
  for (const service of ["api", "worker", "web", "valkey"])
    expect(Object.keys(config.services[service].networks)).toEqual(["default"]);
});
