const { prisma } = require("../config/db.js");
const express = require("express");

const PartnerTypeRouter = express.Router();

//ดู all partner type
PartnerTypeRouter.get('/', async (req, res) => {
  try {
    const data = await prisma.partnerType.findMany({
        orderBy: {id: "asc"},
        include: {partners:true}
    })
    return res.status(200).json(data)
  } catch (error) {
    console.log(error)
    return res.status(500).json({message: "Failed to fetch partner types", error: error.message})
  }
})

//ดู partner type by id
PartnerTypeRouter.get('/:id', async (req, res) => {
    try{
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({message: "Invalid partner type ID", error: "Invalid ID format"})
        }
        const data = await prisma.partnerType.findUnique({
            where:{id},
            include:{partners:true}
        })
        if(!data){
            return res.status(404).json({message: "Partner type not found", error: "Partner type not found"})
        }
        return res.status(200).json(data)
    }catch(error){
        console.log(error)
        return res.status(500).json({message: "Failed to fetch partner type", error: error.message})
    
    }
})

//สร้าง partner type
PartnerTypeRouter.post('/', async (req, res) => {
    try{
        //รับค่า name จาก body
        const {name} = req.body;
        //เช็คว่า name เป็น string และไม่ว่าง
        if(!name || typeof name !== 'string' || !name.trim()){
            return res.status(400).json({message: "Invalid name"})
        }
        //trim name เพื่อให้ข้อมูลไม่ซ้ำกัน เช่น " Contractor" กับ "Contractor"
        const existingType = await prisma.partnerType.findUnique({
            where:{name: name.trim()},
        });
        //ถ้ามีข้อมูลอยู่แล้วให้ return error
        if(existingType){
            return res.status(400).json({message: "Partner type already exists", error: "Partner type already exists"})
        }
        //สร้างข้อมูลใหม่
        const data = await prisma.partnerType.create({
            data:{
                name: name.trim(),
            }
        })
        return res.status(200).json(data)
    }catch(error){
        console.log(error)
        return res.status(500).json({message: "Failed to create partner type", error: error.message})
    
    }
})

//update partner type
PartnerTypeRouter.put('/:id', async(req,res) => {
    try{
        const id = parseInt(req.params.id);
         if (isNaN(id)) {
      return res.status(400).json({ message: "รหัส ID ไม่ถูกต้อง" });
    }

        const name = req.body.name;
        if(!name || typeof name !== 'string' || !name.trim()){
            return res.status(400).json({message: "Invalid name"})
        }
        //update partner type
        const data = await prisma.partnerType.update({
            where: {id},
            data: {name: name.trim()},
            include: {partners:true}
        });
    
        return res.status(200).json(data);

    }catch(error){
        console.error("Update location type error:", error);
        if (error.code === "P2025") {
            return res.status(404).json({ message: "ไม่พบข้อมูลประเภทสถานที่ที่ต้องการแก้ไข" });
        }
    if (error.code === "P2002") {
      return res.status(400).json({ message: "ชื่อประเภทสถานที่นี้มีอยู่แล้วในระบบ" });
    }
    return res.status(500).json({ message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", error: error.message });
}
});

PartnerTypeRouter.delete('/:id', async(req, res) => {
    try{
        const id = parseInt(req.params.id);
        if(isNaN(id)){
            return res.status(400).json({message: "Invalid partner type ID", error: "Invalid ID format"})
        }
        const data = await prisma.partnerType.delete({
            where: {id},
        })
        return res.status(200).json(data)
    }catch(error){
        console.log(error)
        return res.status(500).json({message: "Failed to delete partner type", error: error.message})
    }
});

module.exports = PartnerTypeRouter;

