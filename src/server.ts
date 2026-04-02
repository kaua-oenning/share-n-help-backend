import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import bemRoutes from "./routes/bemRoutes";
import authRoutes from "./routes/authRoutes";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

const app = Fastify({ logger: true });

async function start() {
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : ["http://localhost:5173"],
    credentials: true,
  });

  await app.register(jwt, {
    secret: process.env.JWT_SECRET!,
  });

  app.decorate("authenticate", async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ message: "Token inválido ou ausente." });
    }
  });

  app.register(authRoutes, { prefix: "/api" });
  app.register(bemRoutes, { prefix: "/api" });

  try {
    await app.listen({ port: 3000, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
