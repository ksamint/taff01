import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("makes restricted source migrations readable by the unprivileged image user", () => {
  const dockerfile = readFileSync("deploy/Dockerfile.server", "utf8");
  expect(dockerfile).toContain(
    "COPY --from=build --chmod=0555 /repo/dist/server/migrations ./migrations",
  );
  expect(readFileSync("deploy/Dockerfile.web", "utf8")).toContain(
    "COPY --from=build --chmod=0555 /repo/apps/web/public ./apps/web/public",
  );
});

it("builds the base Compose worker with its own production dependencies", () => {
  const config = JSON.parse(
    execFileSync(
      "docker",
      [
        "compose",
        "--env-file",
        ".env.production.example",
        "-f",
        "compose.prod.yaml",
        "config",
        "--format",
        "json",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          TAFF_IMAGE_WORKER: "taff-worker-test",
          TAFF_TAG: "test",
        },
      },
    ),
  );
  expect(config.services.worker.image).toBe("taff-worker-test:test");
  expect(config.services.worker.build.args.TARGET).toBe("worker");
  expect(config.services.worker.command).toEqual(["node", "dist/worker.mjs"]);
  expect(config.services.valkey.command).toEqual([
    "valkey-server",
    "--save",
    "",
    "--appendonly",
    "yes",
    "--appendfsync",
    "everysec",
    "--maxmemory",
    "256mb",
    "--maxmemory-policy",
    "noeviction",
  ]);
  expect(config.services.valkey.volumes).toContainEqual(
    expect.objectContaining({
      type: "volume",
      source: "valkey_data",
      target: "/data",
    }),
  );
  for (const service of ["api", "worker"])
    expect(config.services[service].stop_grace_period).toBe("30s");
});

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
  const email = {
    EMAIL_HOST: "smtp.example.test",
    EMAIL_PORT: "587",
    EMAIL_SECURE: "false",
    EMAIL_USER: "fixture",
    EMAIL_PASSWORD: "compose-test-only",
    EMAIL_FROM: "taff@example.test",
    EMAIL_LOG_PATH: "/app/.taff-mail/messages.jsonl",
  };
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
          ...email,
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
  expect(config.services.api.environment).toMatchObject(email);
  for (const service of ["migrate", "worker", "web"])
    for (const key of Object.keys(email))
      expect(config.services[service].environment[key]).toBeUndefined();
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
