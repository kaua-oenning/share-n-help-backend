import { FastifyInstance } from "fastify";
import { prisma } from "../database/prisma";

export default async function bemRoutes(app: FastifyInstance) {
  // Rotas públicas
  app.get("/bens", async (request, reply) => {
    const { status } = request.query as { status?: string };
    const whereClause: Record<string, unknown> = {};
    if (status) whereClause.status = status;

    const bens = await prisma.donation.findMany({
      where: whereClause,
      include: { interests: true },
    });
    return reply.send(bens);
  });

  app.get("/bens/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
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

  app.post("/bens/:id/interest", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const { name, phone, email } = request.body as { name: string; phone: string; email: string };

      if (!name || !phone || !email) {
        return reply.status(400).send({ message: "Nome, telefone e email são obrigatórios." });
      }

      await prisma.interest.create({ data: { name, phone, email, donationId: id } });
      return reply.send({ success: true });
    } catch (error: any) {
      return reply.status(500).send({ message: "Erro ao adicionar interesse.", error: error.message });
    }
  });

  // Rotas protegidas — exigem JWT válido
  app.post(
    "/bens/salvar",
    { preHandler: [(app as any).authenticate] },
    async (request, reply) => {
      try {
        const user = (request as any).user as { sub: string };
        const body = request.body as any;

        const { title, description, categoryId, condition, location, pickupDates, pickupTimes, contactName, contactPhone, contactEmail, status, imageUrl, interestsNumber } = body;

        if (!title || !categoryId || !location) {
          return reply.status(400).send({ success: false, message: "Campos obrigatórios ausentes." });
        }

        const bem = await prisma.donation.create({
          data: {
            title,
            description,
            categoryId,
            condition,
            location,
            pickupDates,
            pickupTimes,
            contactName: contactName ?? "",
            contactPhone: contactPhone ?? "",
            contactEmail: contactEmail ?? "",
            status: status ?? "available",
            imageUrl: imageUrl ?? null,
            interestsNumber: interestsNumber ?? 0,
            userId: user.sub, // sempre do token, nunca do body
            updatedAt: new Date(),
          },
        });

        return reply.send({ success: true, id: bem.id, bem });
      } catch (error: any) {
        return reply.status(500).send({ success: false, message: "Erro ao salvar bem.", error: error.message });
      }
    }
  );

  app.patch(
    "/bens/:id/status",
    { preHandler: [(app as any).authenticate] },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const { status } = request.body as { status: string };
        const user = (request as any).user as { sub: string };

        if (!status) {
          return reply.status(400).send({ message: "Status é obrigatório." });
        }

        // Verificar ownership
        const bem = await prisma.donation.findUnique({ where: { id } });
        if (!bem) return reply.status(404).send({ message: "Item não encontrado." });
        if (bem.userId !== user.sub) {
          return reply.status(403).send({ message: "Sem permissão para alterar este item." });
        }

        await prisma.donation.update({ where: { id }, data: { status, updatedAt: new Date() } });
        return reply.send({ success: true });
      } catch (error: any) {
        return reply.status(500).send({ message: "Erro ao atualizar status.", error: error.message });
      }
    }
  );

  // Rota autenticada: listar apenas os itens do usuário logado
  app.get(
    "/bens/meus",
    { preHandler: [(app as any).authenticate] },
    async (request, reply) => {
      const user = (request as any).user as { sub: string };
      const bens = await prisma.donation.findMany({
        where: { userId: user.sub },
        include: { interests: true },
      });
      return reply.send(bens);
    }
  );
}
