import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import bemRoutes from "./routes/bemRoutes";
import authRoutes from "./routes/authRoutes";

const app = Fastify({
  logger: true,
});

async function start() {
  await app.register(cors, {
    origin: true,
  });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'supersecret123',
  });

  app.register(authRoutes, { prefix: "/api" });
  app.register(bemRoutes, { prefix: "/api" });

  try {
    await app.listen({
      port: 3000,
      host: "0.0.0.0",
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
