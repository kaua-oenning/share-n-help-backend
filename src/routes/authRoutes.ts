import { FastifyInstance } from "fastify";
import { prisma } from "../database/prisma";
import bcrypt from "bcryptjs";
import "@fastify/jwt";

export default async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request, reply) => {
    const { name, email, password } = request.body as any;

    if (!name || !email || !password) {
      return reply.status(400).send({ message: "Nome, email e senha são obrigatórios." });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return reply.status(400).send({ message: "Email já cadastrado." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    const token = app.jwt.sign({
      sub: user.id,
      name: user.name,
      email: user.email,
    });

    return reply.status(201).send({ token, user: { id: user.id, name: user.name, email: user.email } });
  });

  app.post("/auth/login", async (request, reply) => {
    const { email, password } = request.body as any;

    if (!email || !password) {
      return reply.status(400).send({ message: "Email e senha são obrigatórios." });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return reply.status(401).send({ message: "Credenciais inválidas." });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return reply.status(401).send({ message: "Credenciais inválidas." });
    }

    const token = app.jwt.sign({
      sub: user.id,
      name: user.name,
      email: user.email,
    });

    return reply.send({ token, user: { id: user.id, name: user.name, email: user.email } });
  });
}
