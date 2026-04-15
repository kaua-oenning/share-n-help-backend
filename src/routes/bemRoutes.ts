import { FastifyInstance } from "fastify";
import { prisma } from "../database/prisma";

// Auto-confirm expired pending_confirmation donations (24h after donor confirmed)
async function autoConfirmExpired(donationId?: string) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const where: any = {
    status: "pending_confirmation",
    donorConfirmedAt: { lt: cutoff },
  };
  if (donationId) where.id = donationId;

  const expired = await prisma.donation.findMany({ where });
  for (const d of expired) {
    await prisma.donation.update({
      where: { id: d.id },
      data: { status: "donated", recipientConfirmedAt: new Date(), updatedAt: new Date() },
    });
    await prisma.notification.create({
      data: {
        userId: d.userId,
        type: "auto_confirmed",
        message: `"${d.title}" foi marcado como doado automaticamente (confirmação expirada).`,
        relatedItemId: d.id,
      },
    });
  }
}

export default async function bemRoutes(app: FastifyInstance) {
  // Public: list donations with pagination
  app.get("/bens", async (request, reply) => {
    await autoConfirmExpired();

    const { page = "1", limit = "12", status } = request.query as {
      page?: string;
      limit?: string;
      status?: string;
    };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
    const skip = (pageNum - 1) * limitNum;

    const whereClause: Record<string, unknown> = {};
    if (status) whereClause.status = status;

    const [items, total] = await Promise.all([
      prisma.donation.findMany({
        where: whereClause,
        include: { interests: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.donation.count({ where: whereClause }),
    ]);

    return reply.send({
      items,
      total,
      page: pageNum,
      limit: limitNum,
      hasMore: skip + items.length < total,
    });
  });

  // Public: count available items per category
  app.get("/bens/count-by-category", async (_request, reply) => {
    const counts = await prisma.donation.groupBy({
      by: ["categoryId"],
      where: { status: "available" },
      _count: { id: true },
    });
    const result: Record<string, number> = {};
    for (const c of counts) {
      result[c.categoryId] = c._count.id;
    }
    return reply.send(result);
  });

  // Authenticated: list user's own items
  app.get(
    "/bens/meus",
    { preHandler: [(app as any).authenticate] },
    async (request, reply) => {
      const user = (request as any).user as { sub: string };
      const bens = await prisma.donation.findMany({
        where: { userId: user.sub },
        include: { interests: true },
        orderBy: { createdAt: "desc" },
      });
      return reply.send(bens);
    }
  );

  // Public: get single donation
  app.get("/bens/:id", async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      await autoConfirmExpired(id);

      const bem = await prisma.donation.findUnique({
        where: { id },
        include: {
          interests: true,
          user: { select: { id: true, name: true } },
        },
      });
      if (!bem) return reply.status(404).send({ message: "Item não encontrado." });
      return reply.send(bem);
    } catch (error: any) {
      return reply.status(500).send({ message: "Erro ao buscar item.", error: error.message });
    }
  });

  // Authenticated: express interest in a donation
  app.post(
    "/bens/:id/interest",
    {
      preHandler: [(app as any).authenticate],
      config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const userPayload = (request as any).user as { sub: string };
        const { phone } = request.body as { phone: string };

        const userRecord = await prisma.user.findUnique({ where: { id: userPayload.sub } });
        if (!userRecord) {
          return reply.status(401).send({ message: "Usuário não encontrado." });
        }

        if (!phone) {
          return reply.status(400).send({ message: "Telefone é obrigatório." });
        }

        const donation = await prisma.donation.findUnique({ where: { id } });
        if (!donation) {
          return reply.status(404).send({ message: "Item não encontrado." });
        }

        if (donation.userId === userPayload.sub) {
          return reply.status(400).send({ message: "Você não pode demonstrar interesse no próprio item." });
        }

        // Check if user already expressed interest
        const existing = await prisma.interest.findFirst({
          where: { donationId: id, email: userRecord.email },
        });
        if (existing) {
          return reply.status(400).send({ success: false, message: "Você já demonstrou interesse neste item." });
        }

        await prisma.interest.create({
          data: { name: userRecord.name, phone, email: userRecord.email, donationId: id },
        });

        // Create notification for the item owner
        await prisma.notification.create({
          data: {
            userId: donation.userId,
            type: "new_interest",
            message: `${userRecord.name} demonstrou interesse em "${donation.title}"`,
            relatedItemId: id,
          },
        });

        return reply.send({ success: true });
      } catch (error: any) {
        return reply.status(500).send({ message: "Erro ao adicionar interesse.", error: error.message });
      }
    }
  );

  // Authenticated: create donation
  app.post(
    "/bens/salvar",
    {
      preHandler: [(app as any).authenticate],
      config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      try {
        const user = (request as any).user as { sub: string };
        const body = request.body as any;

        const {
          title, description, categoryId, condition, location,
          pickupDates, pickupTimes, contactName, contactPhone,
          contactEmail, status, imageUrl, interestsNumber,
        } = body;

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
            userId: user.sub,
            updatedAt: new Date(),
          },
        });

        return reply.send({ success: true, id: bem.id, bem });
      } catch (error: any) {
        return reply.status(500).send({ success: false, message: "Erro ao salvar bem.", error: error.message });
      }
    }
  );

  // Authenticated: update donation (edit)
  app.put(
    "/bens/:id",
    { preHandler: [(app as any).authenticate] },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const user = (request as any).user as { sub: string };
        const body = request.body as any;

        const bem = await prisma.donation.findUnique({ where: { id } });
        if (!bem) return reply.status(404).send({ message: "Item não encontrado." });
        if (bem.userId !== user.sub) {
          return reply.status(403).send({ message: "Sem permissão para alterar este item." });
        }

        const {
          title, description, categoryId, condition, location,
          pickupDates, pickupTimes, contactName, contactPhone,
          contactEmail, imageUrl,
        } = body;

        const updated = await prisma.donation.update({
          where: { id },
          data: {
            ...(title !== undefined && { title }),
            ...(description !== undefined && { description }),
            ...(categoryId !== undefined && { categoryId }),
            ...(condition !== undefined && { condition }),
            ...(location !== undefined && { location }),
            ...(pickupDates !== undefined && { pickupDates }),
            ...(pickupTimes !== undefined && { pickupTimes }),
            ...(contactName !== undefined && { contactName }),
            ...(contactPhone !== undefined && { contactPhone }),
            ...(contactEmail !== undefined && { contactEmail }),
            ...(imageUrl !== undefined && { imageUrl }),
            updatedAt: new Date(),
          },
        });

        return reply.send({ success: true, bem: updated });
      } catch (error: any) {
        return reply.status(500).send({ message: "Erro ao atualizar item.", error: error.message });
      }
    }
  );

  // Authenticated: update donation status (with confirmation flow)
  app.patch(
    "/bens/:id/status",
    { preHandler: [(app as any).authenticate] },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const { status, interestId } = request.body as { status: string; interestId?: string };
        const user = (request as any).user as { sub: string };

        if (!status) {
          return reply.status(400).send({ message: "Status é obrigatório." });
        }

        const bem = await prisma.donation.findUnique({ where: { id } });
        if (!bem) return reply.status(404).send({ message: "Item não encontrado." });
        if (bem.userId !== user.sub) {
          return reply.status(403).send({ message: "Sem permissão para alterar este item." });
        }

        const updateData: any = { status, updatedAt: new Date() };

        if (status === "pending_confirmation" && interestId) {
          updateData.donatedToInterestId = interestId;
          updateData.donorConfirmedAt = new Date();

          // Find the interest and notify the recipient
          const interest = await prisma.interest.findUnique({ where: { id: interestId } });
          if (interest) {
            // Look up user by email to send notification
            const recipientUser = await prisma.user.findUnique({
              where: { email: interest.email },
            });
            if (recipientUser) {
              await prisma.notification.create({
                data: {
                  userId: recipientUser.id,
                  type: "recipient_confirm_request",
                  message: `Você foi selecionado para receber "${bem.title}". Confirme o recebimento.`,
                  relatedItemId: id,
                },
              });
            }
          }
        }

        await prisma.donation.update({ where: { id }, data: updateData });
        return reply.send({ success: true });
      } catch (error: any) {
        return reply.status(500).send({ message: "Erro ao atualizar status.", error: error.message });
      }
    }
  );

  // Authenticated: confirm receipt (recipient side)
  app.patch(
    "/bens/:id/confirm-receipt",
    { preHandler: [(app as any).authenticate] },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const user = (request as any).user as { sub: string; email: string };

        const bem = await prisma.donation.findUnique({
          where: { id },
          include: { interests: true },
        });
        if (!bem) return reply.status(404).send({ message: "Item não encontrado." });
        if (bem.status !== "pending_confirmation") {
          return reply.status(400).send({ message: "Este item não está aguardando confirmação." });
        }

        // Verify current user email matches selected interest email
        const selectedInterest = bem.interests.find(
          (i) => i.id === bem.donatedToInterestId
        );
        if (!selectedInterest) {
          return reply.status(400).send({ message: "Interesse selecionado não encontrado." });
        }

        const currentUser = await prisma.user.findUnique({ where: { id: user.sub } });
        if (!currentUser || currentUser.email !== selectedInterest.email) {
          return reply.status(403).send({ message: "Você não é o destinatário selecionado." });
        }

        await prisma.donation.update({
          where: { id },
          data: {
            status: "donated",
            recipientConfirmedAt: new Date(),
            updatedAt: new Date(),
          },
        });

        // Notify the donor
        await prisma.notification.create({
          data: {
            userId: bem.userId,
            type: "donation_confirmed",
            message: `${currentUser.name} confirmou o recebimento de "${bem.title}"`,
            relatedItemId: id,
          },
        });

        return reply.send({ success: true });
      } catch (error: any) {
        return reply.status(500).send({ message: "Erro ao confirmar recebimento.", error: error.message });
      }
    }
  );

  // Authenticated: cancel selection (revert to available)
  app.patch(
    "/bens/:id/cancel-selection",
    { preHandler: [(app as any).authenticate] },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const user = (request as any).user as { sub: string };

        const bem = await prisma.donation.findUnique({
          where: { id },
          include: { interests: true },
        });
        if (!bem) return reply.status(404).send({ message: "Item não encontrado." });
        if (bem.userId !== user.sub) {
          return reply.status(403).send({ message: "Sem permissão." });
        }
        if (bem.status !== "pending_confirmation") {
          return reply.status(400).send({ message: "Item não está aguardando confirmação." });
        }

        const selectedInterest = bem.interests.find((i) => i.id === bem.donatedToInterestId);

        await prisma.donation.update({
          where: { id },
          data: {
            status: "available",
            donatedToInterestId: null,
            donorConfirmedAt: null,
            recipientConfirmedAt: null,
            updatedAt: new Date(),
          },
        });

        if (selectedInterest) {
          const recipientUser = await prisma.user.findUnique({
            where: { email: selectedInterest.email },
          });
          if (recipientUser) {
            await prisma.notification.create({
              data: {
                userId: recipientUser.id,
                type: "selection_cancelled",
                message: `A seleção para "${bem.title}" foi cancelada pelo doador. O item está disponível novamente.`,
                relatedItemId: id,
              },
            });
          }
        }

        return reply.send({ success: true });
      } catch (error: any) {
        return reply.status(500).send({ message: "Erro ao cancelar seleção.", error: error.message });
      }
    }
  );
}
