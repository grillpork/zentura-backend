const { prisma } = require("../config/db.js");
const express = require("express");

const router = express.Router();

// Get all packages
router.get("/", async (req, res) => {
  try {
    const data = await prisma.package.findMany({
      include: {
        location: true,
        partner: {
          include: {
            pt_type: true,
          },
        },
        partners: {
          include: {
            partner: {
              include: {
                pt_type: true,
              },
            },
          },
        },
        images: {
          orderBy: { sort_order: "asc" },
        },
        addons: {
          orderBy: { id: "asc" },
        },
        dayplans: {
          orderBy: { day_num: "asc" },
          include: {
            activities: true,
            meals: {
              include: { meal: true },
            },
          },
        },
      },
      orderBy: { id: "desc" },
    });
    return res.status(200).json(data);
  } catch (error) {
    console.error("Get packages error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get package by ID
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = await prisma.package.findUnique({
      where: { id },
      include: {
        location: true,
        partner: {
          include: {
            pt_type: true,
          },
        },
        partners: {
          include: {
            partner: {
              include: {
                pt_type: true,
              },
            },
          },
        },
        images: {
          orderBy: { sort_order: "asc" },
        },
        addons: {
          orderBy: { id: "asc" },
        },
        dayplans: {
          orderBy: { day_num: "asc" },
          include: {
            activities: {
              orderBy: { id: "asc" },
            },
            meals: {
              include: { meal: true },
            },
            location: true,
          },
        },
      },
    });
    if (!data) return res.status(404).json({ message: "Package not found" });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Create new package
router.post("/", async (req, res) => {
  try {
    const { name, description, price, location_id, status, image, images, days, partner_id, partner_ids, addons } = req.body;

    const primaryPartnerId = partner_id ? parseInt(partner_id) : (Array.isArray(partner_ids) && partner_ids.length > 0 ? parseInt(partner_ids[0]) : null);

    // Determine cover image URL
    let coverImageUrl = image;
    if (Array.isArray(images) && images.length > 0) {
      const coverObj = images.find((img) => typeof img === "object" && img.is_cover);
      if (coverObj) {
        coverImageUrl = coverObj.image_url;
      } else {
        coverImageUrl = typeof images[0] === "string" ? images[0] : images[0].image_url;
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const newPackage = await tx.package.create({
        data: {
          name,
          description,
          price: parseFloat(price) || 0,
          location_id: parseInt(location_id) || null,
          partner_id: primaryPartnerId || null,
          status: status || "Draft",
          image: coverImageUrl || "https://images.unsplash.com/photo-1589394815804-964ce0fa2556?auto=format&fit=crop&w=800&q=80",
          addons: {
            create: (addons || []).map((addon) => ({
              addon_name: addon.addon_name || "",
              price: parseFloat(addon.price) || 0,
              max_limit: parseInt(addon.max_limit) || 1,
              status: parseInt(addon.status) ?? 1,
              booking_id: addon.booking_id ? parseInt(addon.booking_id) : null,
            })),
          },
          dayplans: {
            create: (days || []).map((day) => ({
              day_num: parseInt(day.day_num) || 1,
              title: day.title,
              dt: day.dt,
              description: day.description,
              hotel: day.hotel,
              location_id: parseInt(day.id_location) || parseInt(day.location_id) || parseInt(location_id) || null,
              activities: {
                create: (day.activities || []).map((act) => ({
                  time: act.time,
                  activity: act.activity,
                  status: act.status,
                  landmark: act.landmark,
                })),
              },
            })),
          },
        },
        include: {
          dayplans: true,
          addons: true,
        },
      });

      // Save images in package_images table
      if (Array.isArray(images) && images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const url = typeof img === "string" ? img : img.image_url;
          if (url && url.trim()) {
            await tx.packageImage.create({
              data: {
                package_id: newPackage.id,
                image_url: url.trim(),
                is_cover: typeof img === "object" ? !!img.is_cover : i === 0,
                sort_order: typeof img === "object" && img.sort_order !== undefined ? parseInt(img.sort_order) : i,
                caption: typeof img === "object" ? img.caption || null : null,
              },
            });
          }
        }
      } else if (coverImageUrl) {
        await tx.packageImage.create({
          data: {
            package_id: newPackage.id,
            image_url: coverImageUrl,
            is_cover: true,
            sort_order: 0,
          },
        });
      }

      // Handle partners join table
      const pidsToLink = Array.isArray(partner_ids) && partner_ids.length > 0
        ? partner_ids.map((p) => parseInt(p)).filter(Boolean)
        : (primaryPartnerId ? [primaryPartnerId] : []);

      const uniquePids = Array.from(new Set(pidsToLink));
      for (const pid of uniquePids) {
        await tx.packagePartner.create({
          data: {
            package_id: newPackage.id,
            partner_id: pid,
          },
        });
      }

      // Handle meals
      if (Array.isArray(days)) {
        for (const day of days) {
          if (day.meals && day.meals.length > 0) {
            const createdDay = newPackage.dayplans.find((d) => d.day_num === parseInt(day.day_num));
            if (createdDay) {
              for (const mealName of day.meals) {
                let mealType = await tx.meal.findUnique({ where: { type_name: mealName } });
                if (!mealType) {
                  mealType = await tx.meal.create({ data: { type_name: mealName } });
                }
                await tx.dayplanMeal.create({
                  data: {
                    id_dayplan: createdDay.id,
                    id_meal: mealType.id,
                  },
                });
              }
            }
          }
        }
      }

      return newPackage;
    });

    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error("Create package error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update package
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, price, location_id, status, image, images, days, partner_id, partner_ids, addons } = req.body;

    const primaryPartnerId = partner_id ? parseInt(partner_id) : (Array.isArray(partner_ids) && partner_ids.length > 0 ? parseInt(partner_ids[0]) : null);

    const result = await prisma.$transaction(async (tx) => {
      // Update basic info & partner
      const updatedPackage = await tx.package.update({
        where: { id },
        data: {
          name,
          description,
          price: parseFloat(price) || 0,
          location_id: parseInt(location_id) || null,
          partner_id: primaryPartnerId || null,
          status: status || "Draft",
          image: image,
        },
      });

      // Sync package images
      await tx.packageImage.deleteMany({ where: { package_id: id } });
      let finalCoverImage = image;

      if (Array.isArray(images) && images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const url = typeof img === "string" ? img : img.image_url;
          if (url && url.trim()) {
            const isCover = typeof img === "object" ? !!img.is_cover : i === 0;
            if (isCover) finalCoverImage = url.trim();
            await tx.packageImage.create({
              data: {
                package_id: id,
                image_url: url.trim(),
                is_cover: isCover,
                sort_order: typeof img === "object" && img.sort_order !== undefined ? parseInt(img.sort_order) : i,
                caption: typeof img === "object" ? img.caption || null : null,
              },
            });
          }
        }
      } else if (image && image.trim()) {
        await tx.packageImage.create({
          data: {
            package_id: id,
            image_url: image.trim(),
            is_cover: true,
            sort_order: 0,
          },
        });
      }

      if (finalCoverImage && finalCoverImage !== image) {
        await tx.package.update({
          where: { id },
          data: { image: finalCoverImage },
        });
      }

      // Sync partners
      await tx.packagePartner.deleteMany({ where: { package_id: id } });
      const pidsToLink = Array.isArray(partner_ids) && partner_ids.length > 0
        ? partner_ids.map((p) => parseInt(p)).filter(Boolean)
        : (primaryPartnerId ? [primaryPartnerId] : []);

      const uniquePids = Array.from(new Set(pidsToLink));
      for (const pid of uniquePids) {
        await tx.packagePartner.create({
          data: {
            package_id: id,
            partner_id: pid,
          },
        });
      }

      // Sync addons: delete old and recreate
      await tx.addonPackage.deleteMany({ where: { package_id: id } });
      if (Array.isArray(addons) && addons.length > 0) {
        for (const addon of addons) {
          if (addon.addon_name?.trim()) {
            await tx.addonPackage.create({
              data: {
                package_id: id,
                addon_name: addon.addon_name.trim(),
                price: parseFloat(addon.price) || 0,
                max_limit: parseInt(addon.max_limit) || 1,
                status: parseInt(addon.status) ?? 1,
                booking_id: addon.booking_id ? parseInt(addon.booking_id) : null,
              },
            });
          }
        }
      }

      // Clean up existing dayplans and their child relations (meals & activities)
      const existingDays = await tx.dayplanTimeline.findMany({
        where: { package_id: id },
        select: { id: true },
      });
      const dayIds = existingDays.map((d) => d.id);
      if (dayIds.length > 0) {
        await tx.dayplanMeal.deleteMany({
          where: { id_dayplan: { in: dayIds } },
        });
        await tx.activityTimeline.deleteMany({
          where: { dayplan_id: { in: dayIds } },
        });
      }
      await tx.dayplanTimeline.deleteMany({ where: { package_id: id } });

      if (days && days.length > 0) {
        for (const day of days) {
          const newDay = await tx.dayplanTimeline.create({
            data: {
              package_id: id,
              day_num: parseInt(day.day_num) || 1,
              title: day.title,
              dt: day.dt,
              description: day.description,
              hotel: day.hotel,
              location_id: parseInt(day.id_location) || parseInt(day.location_id) || parseInt(location_id) || null,
              activities: {
                create: (day.activities || []).map((act) => ({
                  time: act.time,
                  activity: act.activity,
                  status: act.status,
                  landmark: act.landmark,
                })),
              },
            },
          });

          if (day.meals && day.meals.length > 0) {
            for (const mealName of day.meals) {
              let mealType = await tx.meal.findUnique({ where: { type_name: mealName } });
              if (!mealType) {
                mealType = await tx.meal.create({ data: { type_name: mealName } });
              }
              await tx.dayplanMeal.create({
                data: {
                  id_dayplan: newDay.id,
                  id_meal: mealType.id,
                },
              });
            }
          }
        }
      }

      return updatedPackage;
    });

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("Update package error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Delete package
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.$transaction(async (tx) => {
      // 1. Delete package partners, addons, & images
      await tx.packagePartner.deleteMany({ where: { package_id: id } });
      await tx.addonPackage.deleteMany({ where: { package_id: id } });
      await tx.packageImage.deleteMany({ where: { package_id: id } });

      // 2. Delete dayplans and nested meals/activities
      const existingDays = await tx.dayplanTimeline.findMany({
        where: { package_id: id },
        select: { id: true },
      });
      const dayIds = existingDays.map((d) => d.id);
      if (dayIds.length > 0) {
        await tx.dayplanMeal.deleteMany({
          where: { id_dayplan: { in: dayIds } },
        });
        await tx.activityTimeline.deleteMany({
          where: { dayplan_id: { in: dayIds } },
        });
      }
      await tx.dayplanTimeline.deleteMany({ where: { package_id: id } });

      // 3. Delete the package
      await tx.package.delete({ where: { id } });
    });
    return res.status(200).json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
