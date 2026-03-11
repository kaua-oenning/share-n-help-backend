import { FastifyInstance } from "fastify";
import { prisma } from "../database/prisma";

export default async function bemRoutes(app: FastifyInstance) {
  app.get("/bens", async (request, reply) => {
    const bens = await prisma.donation.findMany();
    return reply.send(bens);
  });

  app.post("/bens/salvar", async (request, reply) => {
    try {
      if (!request.body || typeof request.body !== "object") {
        return reply
          .status(400)
          .send({ success: false, message: "Dados inválidos." });
      }
      const bens = await prisma.donation.create({
        data: request.body,
      });
      return reply.send({ success: true, bens });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        message: "Erro ao salvar bem.",
        error: error.message,
      });
    }
  });
}
