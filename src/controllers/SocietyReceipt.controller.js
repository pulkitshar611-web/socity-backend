const prisma = require('../lib/prisma');
const PDFDocument = require('pdfkit');

class SocietyReceiptController {
    static async list(req, res) {
        try {
            const { unitId, search, startDate, endDate } = req.query;
            const societyId = req.user.societyId;
            const userId = req.user.id;
            const role = req.user.role;

            const where = { societyId };

            // If resident, filter by their unit
            if (role === 'RESIDENT') {
                const user = await prisma.user.findUnique({
                    where: { id: userId },
                    include: { rentedUnits: true, ownedUnits: true }
                });
                const userUnitIds = [...user.rentedUnits.map(u => u.id), ...user.ownedUnits.map(u => u.id)];
                where.unitId = { in: userUnitIds };
            } else if (unitId) {
                where.unitId = parseInt(unitId);
            }

            if (startDate || endDate) {
                where.date = {};
                if (startDate) where.date.gte = new Date(startDate);
                if (endDate) where.date.lte = new Date(endDate);
            }

            if (search) {
                where.OR = [
                    { receiptNo: { contains: search } },
                    { unit: { number: { contains: search } } },
                    { resident: { name: { contains: search } } }
                ];
            }

            const receipts = await prisma.societyReceipt.findMany({
                where,
                include: {
                    unit: { select: { number: true, block: true } },
                    resident: { select: { name: true } },
                    breakups: { include: { invoice: true } }
                },
                orderBy: { date: 'desc' }
            });

            res.json(receipts);
        } catch (error) {
            console.error('List Receipts Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    static async getById(req, res) {
        try {
            const { id } = req.params;
            const societyId = req.user.societyId;

            const receipt = await prisma.societyReceipt.findFirst({
                where: { id: parseInt(id), societyId },
                include: {
                    unit: true,
                    resident: { select: { name: true, phone: true } },
                    breakups: { include: { invoice: true } },
                    walletTransactions: true
                }
            });

            if (!receipt) {
                return res.status(404).json({ error: 'Receipt not found' });
            }

            res.json(receipt);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    static async create(req, res) {
        try {
            const { unitId, residentId, amount, paymentMethod, transactionId, description, breakups } = req.body;
            const societyId = req.user.societyId;

            const receiptNo = `REC-${Date.now().toString().slice(-8)}`;

            const receipt = await prisma.$transaction(async (tx) => {
                const newReceipt = await tx.societyReceipt.create({
                    data: {
                        receiptNo,
                        societyId,
                        unitId: parseInt(unitId),
                        residentId: parseInt(residentId),
                        amount: parseFloat(amount),
                        paymentMethod,
                        transactionId,
                        description,
                        breakups: {
                            create: (breakups || []).map(b => ({
                                invoiceId: b.invoiceId ? parseInt(b.invoiceId) : null,
                                amount: parseFloat(b.amount),
                                description: b.description
                            }))
                        }
                    },
                    include: { breakups: true }
                });

                // Logic to update invoices if linked
                for (const breakup of (breakups || [])) {
                    if (breakup.invoiceId) {
                        // Check if invoice is fully paid
                        const invoice = await tx.invoice.findUnique({
                            where: { id: parseInt(breakup.invoiceId) },
                            include: { receiptBreakups: true }
                        });

                        const totalPaid = invoice.receiptBreakups.reduce((sum, b) => sum + b.amount, 0) + parseFloat(breakup.amount);

                        if (totalPaid >= invoice.amount) {
                            await tx.invoice.update({
                                where: { id: invoice.id },
                                data: { status: 'PAID', paidDate: new Date(), paymentMode: paymentMethod }
                            });
                        }
                    }
                }

                return newReceipt;
            });

            res.status(201).json(receipt);
        } catch (error) {
            console.error('Create Receipt Error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    static async generatePDF(req, res) {
        try {
            const { id } = req.params;
            const societyId = req.user.societyId;

            const receipt = await prisma.societyReceipt.findFirst({
                where: { id: parseInt(id), societyId },
                include: {
                    unit: true,
                    resident: { select: { name: true, phone: true } },
                    breakups: { include: { invoice: true } },
                    society: true
                }
            });

            if (!receipt) {
                return res.status(404).json({ error: 'Receipt not found' });
            }

            const doc = new PDFDocument({ margin: 50 });

            // Stream the PDF to the response
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=Receipt_${receipt.receiptNo}.pdf`);
            doc.pipe(res);

            // Header
            doc.fontSize(20).text(receipt.society.name, { align: 'center' });
            doc.fontSize(10).text(receipt.society.address || '', { align: 'center' });
            doc.moveDown();
            doc.fontSize(16).text('PAYMENT RECEIPT', { align: 'center', underline: true });
            doc.moveDown();

            // Receipt Info
            const currentY = doc.y;
            doc.fontSize(10).text(`Receipt No: ${receipt.receiptNo}`, 50, currentY);
            doc.text(`Date: ${receipt.date.toLocaleDateString()}`, 400, currentY);
            doc.moveDown();

            // Resident Info
            doc.text(`Received From: ${receipt.resident.name}`, 50);
            doc.text(`Unit: ${receipt.unit.block} - ${receipt.unit.number}`, 50);
            doc.moveDown();

            // Table Header
            const tableTop = doc.y;
            doc.font('Helvetica-Bold');
            doc.text('Description', 50, tableTop);
            doc.text('Amount', 450, tableTop, { align: 'right' });
            doc.moveDown();
            doc.font('Helvetica');
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown(0.5);

            // Table Rows
            receipt.breakups.forEach(item => {
                const desc = item.invoice ? `Payment for Invoice ${item.invoice.invoiceNo}` : item.description;
                doc.text(desc, 50);
                doc.text(`₹${item.amount.toFixed(2)}`, 450, doc.y - 12, { align: 'right' });
                doc.moveDown(0.5);
            });

            if (receipt.breakups.length === 0) {
                doc.text(receipt.description || 'General Payment', 50);
                doc.text(`₹${receipt.amount.toFixed(2)}`, 450, doc.y - 12, { align: 'right' });
                doc.moveDown();
            }

            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown();

            // Total
            doc.font('Helvetica-Bold');
            doc.text('Total Amount Paid:', 300);
            doc.text(`₹${receipt.amount.toFixed(2)}`, 450, doc.y - 12, { align: 'right' });
            doc.moveDown();

            // Footer
            doc.font('Helvetica').fontSize(10);
            doc.text(`Payment Method: ${receipt.paymentMethod}`, 50);
            if (receipt.transactionId) {
                doc.text(`Transaction ID: ${receipt.transactionId}`, 50);
            }
            doc.moveDown(2);
            doc.text('This is a computer generated receipt and does not require a signature.', { align: 'center', color: 'grey' });

            doc.end();
        } catch (error) {
            console.error('PDF Generation Error:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = SocietyReceiptController;
