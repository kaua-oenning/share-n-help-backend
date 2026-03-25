import { FastifyInstance } from "fastify";
import { prisma } from "../database/prisma";

export default async function bemRoutes(app: FastifyInstance) {
  app.get("/bens", async (request, reply) => {
    const { status, userId } = request.query as any;
    const whereClause: any = {};
    if (status) whereClause.status = status;
    if (userId) whereClause.userId = userId;

    const bens = await prisma.donation.findMany({
      where: whereClause,
      include: {
        interests: true,
      },
    });
    return reply.send(bens);
  });

  app.get("/bens/:id", async (request, reply) => {
    try {
      const { id } = request.params as any;
      const bem = await prisma.donation.findUnique({
        where: { id },
        include: { interests: true },
      });
      if (!bem) return reply.status(404).send({ message: "Item não encontrado." });
      return reply.send(bem);
    } catch (error: any) {
      return reply.status(500).send({ message: "Erro ao buscar item.", error: error.message });
    }
  });

  app.post("/bens/salvar", async (request, reply) => {
    try {
      if (!request.body || typeof request.body !== "object") {
        return reply
          .status(400)
          .send({ success: false, message: "Dados inválidos." });
      }
      
      const bens = await prisma.donation.create({
        data: request.body as any,
      });
      return reply.send({ success: true, id: bens.id, bens });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: "Erro ao salvar bem.",
        error: error.message,
      });
    }
  });

  app.post("/bens/:id/interest", async (request, reply) => {
    try {
      const { id } = request.params as any;
      const { name, phone, email } = request.body as any;

      if (!name || !phone || !email) {
        return reply.status(400).send({ message: "Nome, telefone e email são obrigatórios." });
      }

      await prisma.interest.create({
        data: {
          name,
          phone,
          email,
          donationId: id,
        },
      });

      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ message: "Erro ao adicionar interesse.", error: error.message });
    }
  });

  app.patch("/bens/:id/status", async (request, reply) => {
    try {
      const { id } = request.params as any;
      const { status } = request.body as any;

      if (!status) {
        return reply.status(400).send({ message: "Status é obrigatório." });
      }

      await prisma.donation.update({
        where: { id },
        data: { status, updatedAt: new Date() },
      });

      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ message: "Erro ao atualizar status.", error: error.message });
    }
  });
}
