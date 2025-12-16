import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Upload, Button, Card, Row, Col, Typography, Spin, notification, Statistic, Divider, Alert, Tag, Tabs, Table, Collapse } from 'antd';
import { FileExcelOutlined, CheckCircleOutlined, CloudUploadOutlined, BankOutlined, RollbackOutlined, DatabaseOutlined, StopOutlined, CodeOutlined, WalletOutlined, DownloadOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { TabPane } = Tabs;
const { Panel } = Collapse;

// --- 1. KONFIGURASI KOLOM (Updated) ---
const COLS = {
  PRODUK_BUKU: { ID: 0, NAME: 4, PRICE: 17, GROUP_ID: 6 }, 
  CUSTOMER: { CUSTOMER_ID: 0, NAMA: 1, HP: 4, ADDRESS: 3, SALDO_AWAL: 16 }, 
  TRANSAKSI_PENJUALAN: { 
    ID: 0, NO_SL: 1, TGL: 2, CUST_ID: 3, 
    TOTAL_GROSS: 6, TOTAL_DISKON: 7, TOTAL_NET: 8, 
    TELP: 29, KET: 38,
    VALIDATED_BY: 19, VOID_BY: 23 
  },
  DETAIL_PENJUALAN: { DETAIL_ID: 0, TRAS_ID: 1, BARANG_ID: 2, SATUAN: 3, QTY: 4, HARGA: 5, DISCOUNT: 6, PPN: 7, SUBTOTAL: 8 },
  DETAIL_BAYAR: { TRAS_ID: 1, BAYAR: 7 }, 
  RETUR_HEADER: { 
    ID: 0, SL_ID: 1, NO_RJ: 2, TGL: 3, TOTAL_RETUR: 12,
    VALIDATED_BY: 19, VOID_BY: 23
  },
  RETUR_DETAIL: { HEADER_ID: 0, DETAIL_ID: 1, BARANG_ID: 2, QTY: 4, SUBTOTAL: 8 },
  PIUTANG_HEADER: { 
    ID: 0, NO_PP: 1, CUST_ID: 2, TGL: 3, KETERANGAN: 4, TOTAL_BAYAR: 11,
    VALIDATED_BY: 20, VOID_BY: 22
  },
  PIUTANG_DETAIL: { ID: 0, HEADER_ID: 1, SL_ID: 2, BAYAR: 4 },
  STOCK_HISTORY: { TRANS_ID: 1, BARANG_ID: 4, HPP: 6, SALDO_AWAL: 8, MUTASI: 9, SALDO_AKHIR: 10, CREATED_DATE: 11 },
  NON_FAKTUR: { 
    ID: 0, CUST_ID: 2, TGL: 3, MEMO: 4, JUMLAH: 5,
    VALIDATED_BY: 16, VOID_BY: 18
  }
};

// --- HELPER UTILS ---
// Strict Normalization for Firebase Keys (Only A-Z, 0-9, _)
const normalizeId = (v) => {
  if (v === null || v === undefined) return "";
  const str = String(v).trim();
  if (str === "") return "";
  // 1. Hapus spasi
  // 2. Uppercase
  // 3. Ganti SEMUA karakter aneh (termasuk . / # $) dengan underscore (_)
  return str.replace(/\s+/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
};

const parseNum = (val) => {
  if (typeof val === 'number') return Math.round(val);
  const str = String(val || '').trim();
  if (!str || str.toUpperCase() === 'NULL') return 0;
  
  let clean = str.replace(/[^0-9,.-]/g, '');
  if (clean.indexOf('.') !== -1 && clean.indexOf(',') !== -1) {
      clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.indexOf('.') !== -1) {
      const parts = clean.split('.');
      if (parts.length > 1 && parts[parts.length - 1].length === 3) {
          clean = clean.replace(/\./g, '');
      }
  } else if (clean.indexOf(',') !== -1) {
      clean = clean.replace(',', '.');
  }
  
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : Math.round(num);
};

const parseBookTitle = (title) => {
  if (!title) return { penerbit: "BSE", kelas: 1 };
  const penerbitMatch = title.match(/\(([^)]+)\)/);
  const penerbit = penerbitMatch ? penerbitMatch[1].trim() : "BSE";
  let kelas = 0; 
  const romanRegex = /\b(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\b/i;
  const romanMatch = title.match(romanRegex);
  if (romanMatch) {
    const romanStr = romanMatch[1].toUpperCase();
    const romanMap = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10, 'XI': 11, 'XII': 12 };
    if (romanMap[romanStr]) kelas = romanMap[romanStr];
  } else {
    const decimalMatch = title.match(/KELAS\s+(\d+)/i);
    if (decimalMatch) {
        kelas = parseInt(decimalMatch[1], 10);
    }
  }
  return { penerbit, kelas };
};

const isExcludedBookId = (id) => {
  if (!id) return false;
  if (/^\d+$/.test(id)) {
    const num = parseInt(id, 10);
    return num >= 1 && num <= 2254;
  }
  return false;
};

const checkRowValidity = (row, idxValidated, idxVoid) => {
  if (!row) return { valid: false, reason: "Empty Row" };
  const validatedBy = row[idxValidated];
  const voidBy = row[idxVoid];
  if (voidBy && String(voidBy).trim().toUpperCase() !== 'NULL' && String(voidBy).trim() !== '') return { valid: false, reason: `Void By ${voidBy}` };
  if (!validatedBy || String(validatedBy).trim().toUpperCase() === 'NULL' || String(validatedBy).trim() === '') return { valid: false, reason: "Not Validated" };
  return { valid: true };
};

const downloadJson = (data, filename) => {
  if (!data || Object.keys(data).length === 0) {
    notification.warning({ message: 'Data Kosong', description: 'Tidak ada data valid untuk diunduh.' });
    return;
  }
  try {
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = filename + ".json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      notification.success({ message: 'Download Berhasil', description: `File ${filename}.json telah diunduh.` });
  } catch (error) {
      notification.error({ message: 'Export Error', description: error.message });
  }
};

// --- MAIN LOGIC PROCESSOR ---
const useDataProcessor = () => {
  const [dataFiles, setDataFiles] = useState({});
  const [loading, setLoading] = useState(false);
  const [isLibReady, setIsLibReady] = useState(false);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js";
    script.async = true;
    script.onload = () => setIsLibReady(true);
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  const handleFile = useCallback((file, type) => {
    if (!window.Papa) return;
    setLoading(true);
    window.Papa.parse(file, {
      complete: (results) => {
        const validData = results.data.filter(row => row.length > 1);
        setDataFiles(prev => ({ ...prev, [type]: validData }));
        setLoading(false);
        notification.success({ message: `File ${type} Loaded`, description: `${validData.length} Rows` });
      },
      header: false, skipEmptyLines: true
    });
    return false;
  }, []);

  const processedData = useMemo(() => {
    const { 
      produkBuku, customer, transaksiPenjualan, detailPenjualan, 
      piutangHeader, piutangDetail, detailBayar, nonFaktur,
      returHeader, returDetail, historyStok
    } = dataFiles;

    if (!produkBuku || !customer) return null;

    // --- FLAT DATA CONTAINERS ---
    const dbProducts = {};           
    const dbCustomers = {};          
    const dbInvoices = {};           
    const dbInvoiceItems = {};       
    const dbPayments = {};           
    const dbPaymentAllocations = {}; 
    const dbReturns = {};            
    const dbReturnItems = {};        
    const dbStockHistory = {};       
    const dbNonFaktur = {}; 
    
    const voidedRows = [];
    
    // Lookup Maps
    const bookMap = new Map();     
    const invTotalQtyMap = new Map(); 
    const transOwnerMap = new Map(); 
    
    if (transaksiPenjualan) {
        transaksiPenjualan.forEach(row => {
            const id = normalizeId(row[COLS.TRANSAKSI_PENJUALAN.ID]);
            const custId = normalizeId(row[COLS.TRANSAKSI_PENJUALAN.CUST_ID]);
            if (id && custId) {
                transOwnerMap.set(id, custId);
            }
        });
    }
    if (returHeader) {
        returHeader.forEach(row => {
            const rId = normalizeId(row[COLS.RETUR_HEADER.ID]);
            const slId = normalizeId(row[COLS.RETUR_HEADER.SL_ID]);
            if (rId && slId && transOwnerMap.has(slId)) {
                transOwnerMap.set(rId, transOwnerMap.get(slId));
            }
        });
    }

    // 1. MASTER BUKU
    produkBuku.forEach(row => {
      const id = normalizeId(row[COLS.PRODUK_BUKU.ID]);
      const name = row[COLS.PRODUK_BUKU.NAME];
      if (id) {
         if (isExcludedBookId(id)) return;
         
         const { penerbit, kelas } = parseBookTitle(name);
         const groupId = parseNum(row[COLS.PRODUK_BUKU.GROUP_ID]);
         let peruntukan = "SISWA";
         if (groupId === 31) peruntukan = "GURU";
         else if (groupId === 30) peruntukan = "SISWA";

         bookMap.set(id, name);
         dbProducts[id] = {
             id: id,
             nama: name,
             harga: parseNum(row[COLS.PRODUK_BUKU.PRICE]),
             diskon: 0,
             jenjang: "",
             kelas: kelas,
             mapel: "UMUM",
             penerbit: penerbit,
             peruntukan: peruntukan,
             spek: "",
             spek_kertas: "Buku",
             stok: 0,
             tipe_buku: "",
             updatedAt: Date.now()
         };
      }
    });

    // 2. CUSTOMERS
    customer.forEach(row => {
      const id = normalizeId(row[COLS.CUSTOMER.CUSTOMER_ID]);
      if (id) {
        dbCustomers[id] = {
          id: id,
          nama: row[COLS.CUSTOMER.NAMA],
          telepon: row[COLS.CUSTOMER.HP] ? String(row[COLS.CUSTOMER.HP]).trim() : "",
          saldoAwal: parseNum(row[COLS.CUSTOMER.SALDO_AWAL]), 
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
      }
    });

    const getCustName = (cid) => dbCustomers[cid]?.nama || "UNKNOWN";

    // 3. INVOICE ITEMS
    if (detailPenjualan) {
      detailPenjualan.forEach(row => {
         const invId = normalizeId(row[COLS.DETAIL_PENJUALAN.TRAS_ID]);
         const bookId = normalizeId(row[COLS.DETAIL_PENJUALAN.BARANG_ID]);
         const qty = parseNum(row[COLS.DETAIL_PENJUALAN.QTY]);
         
         if (invId && bookId) {
             if (isExcludedBookId(bookId)) return;

             const itemId = `ITEM_${invId}_${bookId}`;
             const subtotal = parseNum(row[COLS.DETAIL_PENJUALAN.SUBTOTAL]);
             
             dbInvoiceItems[itemId] = {
                 id: itemId,
                 invoiceId: invId,
                 productId: bookId,
                 judul: bookMap.get(bookId) || "Unknown",
                 harga: parseNum(row[COLS.DETAIL_PENJUALAN.HARGA]),
                 qty: qty,
                 diskonPersen: parseNum(row[COLS.DETAIL_PENJUALAN.DISCOUNT]),
                 subtotal: subtotal,
                 createdAt: Date.now(), 
                 updatedAt: Date.now()
             };

             const prevQty = invTotalQtyMap.get(invId) || 0;
             invTotalQtyMap.set(invId, prevQty + qty);
         }
      });
    }

    // 4. INVOICES
    if (transaksiPenjualan) {
        transaksiPenjualan.forEach(row => {
            const val = checkRowValidity(row, COLS.TRANSAKSI_PENJUALAN.VALIDATED_BY, COLS.TRANSAKSI_PENJUALAN.VOID_BY);
            const invId = normalizeId(row[COLS.TRANSAKSI_PENJUALAN.ID]);
            
            if (!val.valid) {
                voidedRows.push({ type: 'Invoice', id: invId, reason: val.reason });
                return;
            }

            if (invId) {
                const tglStr = row[COLS.TRANSAKSI_PENJUALAN.TGL];
                const ts = tglStr ? new Date(tglStr).getTime() : Date.now();
                const gross = parseNum(row[COLS.TRANSAKSI_PENJUALAN.TOTAL_GROSS]);
                const diskon = parseNum(row[COLS.TRANSAKSI_PENJUALAN.TOTAL_DISKON]);
                let net = parseNum(row[COLS.TRANSAKSI_PENJUALAN.TOTAL_NET]);
                if (net === 0 && gross > 0) net = gross - diskon;

                const custId = normalizeId(row[COLS.TRANSAKSI_PENJUALAN.CUST_ID]);

                dbInvoices[invId] = {
                    id: invId,
                    customerId: custId,
                    namaCustomer: getCustName(custId), 
                    tanggal: ts,
                    totalQty: invTotalQtyMap.get(invId) || 0,
                    totalBruto: gross,
                    totalDiskon: diskon, 
                    totalRetur: 0,
                    totalBiayaLain: 0,
                    totalNetto: net,
                    totalBayar: 0, 
                    statusPembayaran: "BELUM",
                    keterangan: row[COLS.TRANSAKSI_PENJUALAN.KET] || "",
                    createdAt: ts,
                    updatedAt: Date.now()
                };
            }
        });
    }

    const createPayment = (targetDb, id, custId, dateRaw, amount, ket, source) => {
        const ts = dateRaw ? new Date(dateRaw).getTime() : Date.now();
        targetDb[id] = {
            id: id,
            customerId: custId,
            namaCustomer: getCustName(custId), 
            tanggal: ts,
            arah: "IN",
            sumber: source,
            totalBayar: amount, 
            keterangan: ket,
            createdAt: ts,
            updatedAt: Date.now()
        };
        return ts;
    };

    const createAllocation = (payId, invId, amount, ts) => {
        const allocId = `ALLOC_${payId}_${invId}`;
        dbPaymentAllocations[allocId] = {
            id: allocId,
            paymentId: payId,
            invoiceId: invId,
            amount: amount,
            createdAt: ts,
            updatedAt: Date.now()
        };
    };

    // 5. PAYMENTS & ALLOCATIONS
    if (piutangHeader) {
        piutangHeader.forEach(row => {
            const val = checkRowValidity(row, COLS.PIUTANG_HEADER.VALIDATED_BY, COLS.PIUTANG_HEADER.VOID_BY);
            const pid = normalizeId(row[COLS.PIUTANG_HEADER.ID]);
            if (!val.valid) { voidedRows.push({ type: 'Piutang', id: pid, reason: val.reason }); return; }

            if (pid) {
                createPayment(
                    dbPayments,
                    pid, 
                    normalizeId(row[COLS.PIUTANG_HEADER.CUST_ID]),
                    row[COLS.PIUTANG_HEADER.TGL],
                    parseNum(row[COLS.PIUTANG_HEADER.TOTAL_BAYAR]),
                    row[COLS.PIUTANG_HEADER.KETERANGAN] || "Pelunasan Piutang",
                    "INVOICE_PAYMENT"
                );
            }
        });
    }
    
    if (piutangDetail) {
        piutangDetail.forEach(row => {
            const pid = normalizeId(row[COLS.PIUTANG_DETAIL.HEADER_ID]);
            const invId = normalizeId(row[COLS.PIUTANG_DETAIL.SL_ID]);
            const amount = parseNum(row[COLS.PIUTANG_DETAIL.BAYAR]);
            if (pid && invId && dbPayments[pid]) {
                createAllocation(pid, invId, amount, dbPayments[pid].tanggal);
            }
        });
    }

    if (detailBayar) {
        detailBayar.forEach(row => {
            const invId = normalizeId(row[COLS.DETAIL_BAYAR.TRAS_ID]);
            const amount = parseNum(row[COLS.DETAIL_BAYAR.BAYAR]);
            
            if (invId && amount > 0 && dbInvoices[invId]) {
                const payId = `PAY_CASH_${invId}`;
                const inv = dbInvoices[invId];
                const ts = createPayment(dbPayments, payId, inv.customerId, null, amount, "Pembayaran Tunai Awal", "INVOICE_PAYMENT");
                dbPayments[payId].tanggal = inv.tanggal; 
                dbPayments[payId].createdAt = inv.tanggal;
                createAllocation(payId, invId, amount, inv.tanggal);
            }
        });
    }

    if (nonFaktur) {
        nonFaktur.forEach(row => {
            const val = checkRowValidity(row, COLS.NON_FAKTUR.VALIDATED_BY, COLS.NON_FAKTUR.VOID_BY);
            const nid = normalizeId(row[COLS.NON_FAKTUR.ID]);
            if(!val.valid) { voidedRows.push({type: 'NonFaktur', id: nid, reason: val.reason}); return; }

            if(nid) {
                createPayment(
                    dbNonFaktur,
                    nid,
                    normalizeId(row[COLS.NON_FAKTUR.CUST_ID]),
                    row[COLS.NON_FAKTUR.TGL],
                    parseNum(row[COLS.NON_FAKTUR.JUMLAH]),
                    row[COLS.NON_FAKTUR.MEMO] || "Non Faktur",
                    "NON_FAKTUR"
                );
            }
        });
    }

    if (returHeader) {
        returHeader.forEach(row => {
            const val = checkRowValidity(row, COLS.RETUR_HEADER.VALIDATED_BY, COLS.RETUR_HEADER.VOID_BY);
            const rid = normalizeId(row[COLS.RETUR_HEADER.ID]);
            if (!val.valid) { voidedRows.push({type: 'Retur', id: rid, reason: val.reason}); return; }

            const invId = normalizeId(row[COLS.RETUR_HEADER.SL_ID]);
            const totalRetur = parseNum(row[COLS.RETUR_HEADER.TOTAL_RETUR]);

            if (dbInvoices[invId]) {
                dbInvoices[invId].totalRetur = (dbInvoices[invId].totalRetur || 0) + totalRetur;
                dbInvoices[invId].totalNetto = dbInvoices[invId].totalNetto - totalRetur;
            }

            if (rid) {
                const tglStr = row[COLS.RETUR_HEADER.TGL];
                const ts = tglStr ? new Date(tglStr).getTime() : Date.now();
                const custId = dbInvoices[invId] ? dbInvoices[invId].customerId : "UNKNOWN";

                dbReturns[rid] = {
                    id: rid,
                    invoiceId: invId,
                    customerId: custId,
                    namaCustomer: getCustName(custId), 
                    tanggal: ts,
                    arah: "OUT",
                    sumber: "RETURN",
                    totalRetur: totalRetur,
                    keterangan: `Retur No: ${row[COLS.RETUR_HEADER.NO_RJ]}`,
                    createdAt: ts,
                    updatedAt: Date.now()
                };
            }
        });
    }

    if (returDetail) {
        returDetail.forEach(row => {
            const rHeadId = normalizeId(row[COLS.RETUR_DETAIL.HEADER_ID]);
            const bookId = normalizeId(row[COLS.RETUR_DETAIL.BARANG_ID]);
            
            if (rHeadId && bookId && dbReturns[rHeadId]) {
                if (isExcludedBookId(bookId)) return;

                const rItemId = `RITEM_${rHeadId}_${bookId}`;
                const qty = parseNum(row[COLS.RETUR_DETAIL.QTY]);
                const subtotal = parseNum(row[COLS.RETUR_DETAIL.SUBTOTAL]);
                
                dbReturnItems[rItemId] = {
                    id: rItemId,
                    returnId: rHeadId,
                    productId: bookId,
                    judul: bookMap.get(bookId) || "Unknown",
                    qty: qty,
                    harga: qty > 0 ? subtotal / qty : 0,
                    subtotal: subtotal,
                    createdAt: dbReturns[rHeadId].tanggal,
                    updatedAt: Date.now()
                };
            }
        });
    }

    if (historyStok) {
        historyStok.forEach((row, idx) => {
             const refId = normalizeId(row[COLS.STOCK_HISTORY.TRANS_ID]);
             const bookId = normalizeId(row[COLS.STOCK_HISTORY.BARANG_ID]);
             
             if (!refId && !bookId) return;
             if (isExcludedBookId(bookId)) return;

             const mutasi = parseNum(row[COLS.STOCK_HISTORY.MUTASI]);
             const stokAwal = parseNum(row[COLS.STOCK_HISTORY.SALDO_AWAL]);
             const stokAkhir = parseNum(row[COLS.STOCK_HISTORY.SALDO_AKHIR]);
             const dateRaw = row[COLS.STOCK_HISTORY.CREATED_DATE];
             
             let ts = dateRaw ? new Date(dateRaw).getTime() : Date.now();
             if (isNaN(ts) && typeof dateRaw === 'string') {
                 const parts = dateRaw.split(/[/-]/);
                 if (parts.length === 3) {
                     ts = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
                 }
             }
             if (isNaN(ts)) ts = Date.now();

             let nama = "UNKNOWN";
             let keteranganSuffix = "";
             const upperRef = refId.toUpperCase();

             if (upperRef.startsWith("PS") || upperRef.startsWith("MR")) {
                 nama = "ADMIN";
             } else if (upperRef.startsWith("SL") || upperRef.startsWith("RJ")) {
                 const custId = transOwnerMap.get(refId);
                 if (custId && dbCustomers[custId]) {
                     nama = dbCustomers[custId].nama;
                     keteranganSuffix = ` + ${nama}`;
                 }
             }

             const histId = `HIST_${refId}_${bookId}_${idx}`;

             dbStockHistory[histId] = {
                 id: histId,
                 bukuId: bookId,
                 judul: bookMap.get(bookId) || `Unknown Book (${bookId})`,
                 keterangan: `Mutasi Ref: ${refId}${keteranganSuffix}`,
                 stokAwal: stokAwal,
                 perubahan: mutasi,
                 stokAkhir: stokAkhir,
                 refId: refId,
                 nama: nama,
                 tanggal: ts,
                 createdAt: ts,
                 updatedAt: Date.now()
             };
        });
    }

    const invPaidMap = {};
    Object.values(dbPaymentAllocations).forEach(alloc => {
        invPaidMap[alloc.invoiceId] = (invPaidMap[alloc.invoiceId] || 0) + alloc.amount;
    });

    Object.values(dbInvoices).forEach(inv => {
        const paid = invPaidMap[inv.id] || 0;
        const sisa = inv.totalNetto - paid;
        
        inv.totalBayar = paid;

        if (sisa <= 100) { 
            inv.statusPembayaran = "LUNAS";
        } else {
            inv.statusPembayaran = "BELUM";
        }

        const custNameSafe = (inv.namaCustomer || "UNKNOWN").trim().replace(/[.#$[\]/]/g, '_');
        inv.compositeStatus = `${custNameSafe}_${inv.statusPembayaran}`;
    });

    return {
        products: dbProducts,
        customers: dbCustomers,
        invoices: dbInvoices,
        invoice_items: dbInvoiceItems,
        payments: dbPayments,
        non_faktur: dbNonFaktur,
        payment_allocations: dbPaymentAllocations,
        returns: dbReturns,
        return_items: dbReturnItems,
        stock_history: dbStockHistory,
        
        voidedRows,
        stats: {
            products: Object.keys(dbProducts).length,
            customers: Object.keys(dbCustomers).length,
            invoices: Object.keys(dbInvoices).length,
            payments: Object.keys(dbPayments).length,
            non_faktur: Object.keys(dbNonFaktur).length,
            returns: Object.keys(dbReturns).length,
            history: Object.keys(dbStockHistory).length,
            voids: voidedRows.length
        },
        isReady: true
    };

  }, [dataFiles]);

  return { handleFile, loading, processedData, dataFiles, isLibReady };
};

export default function App() {
  const { handleFile, loading, processedData, dataFiles, isLibReady } = useDataProcessor();
  
  const fileTypes = [
    { key: 'produkBuku', name: '1. Master Buku', desc: 'Wajib', color: 'blue' },
    { key: 'customer', name: '2. Master Customer', desc: 'Wajib', color: 'blue' },
    { key: 'transaksiPenjualan', name: '3. Penjualan (SL)', desc: 'Header Jual', color: 'green' },
    { key: 'detailPenjualan', name: '4. Detail Jual', desc: 'Isi Barang', color: 'green' },
    { key: 'detailBayar', name: '5. Detail Bayar', desc: 'Bayar Tunai', color: 'green' },
    { key: 'returHeader', name: '6. Retur Header (RJ)', desc: 'Header Retur', color: 'orange' },
    { key: 'returDetail', name: '7. Retur Detail', desc: 'Isi Retur', color: 'orange' },
    { key: 'piutangHeader', name: '8. Piutang Header', desc: 'Header Piutang', color: 'purple' },
    { key: 'piutangDetail', name: '9. Piutang Detail', desc: 'Bayar Piutang', color: 'purple' },
    { key: 'historyStok', name: '10. History Stok', desc: 'Mutasi Stok', color: 'red' },
    { key: 'nonFaktur', name: '11. Non Faktur', desc: 'Piutang Lain', color: 'cyan' },
  ];

  const getIcon = (key) => (dataFiles[key] ? <CheckCircleOutlined /> : <CloudUploadOutlined />);

  const voidColumns = [
    { title: 'Tipe', dataIndex: 'type', key: 'type', render: t => <Tag color="red">{t}</Tag> },
    { title: 'ID', dataIndex: 'id', key: 'id' },
    { title: 'Alasan', dataIndex: 'reason', key: 'reason', render: t => <Text type="danger">{t}</Text> },
  ];

  return (
    <div style={{ padding: 40, background: '#f0f2f5', minHeight: '100vh' }}>
      <Card style={{ maxWidth: 1200, margin: '0 auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
          <div style={{ textAlign: 'center', marginBottom: 30 }}>
              <Title level={2} style={{ color: '#1890ff', marginBottom: 0 }}>RDTB Converter (Normalized)</Title>
              <Text type="secondary">Convert ERP CSV to Firebase Realtime Database (Flat JSON)</Text>
              {!isLibReady && <div style={{marginTop: 10, color: 'orange'}}><Spin size="small"/> Loading parser...</div>}
          </div>
          
          {/* UPLOAD SECTION */}
          <div style={{ background: '#fafafa', padding: 20, borderRadius: 8, border: '1px dashed #d9d9d9', marginBottom: 30 }}>
            <Row gutter={[16, 16]}>
                {fileTypes.map(f => (
                    <Col xs={24} sm={12} md={8} lg={4} key={f.key}>
                        <Upload beforeUpload={file => handleFile(file, f.key)} showUploadList={false} accept=".csv,.txt,.xlsx,.xls" disabled={!isLibReady}>
                            <Button block size="large" icon={getIcon(f.key)} type={dataFiles[f.key] ? "primary" : "default"} disabled={!isLibReady} style={{ height: 'auto', padding: '12px 10px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
                                    <span style={{ fontWeight: 600 }}>{f.name}</span>
                                    <span style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>{dataFiles[f.key] ? 'Loaded' : f.desc}</span>
                                </div>
                            </Button>
                        </Upload>
                    </Col>
                ))}
            </Row>
          </div>

          {loading && <div style={{ textAlign: 'center', margin: '30px 0' }}><Spin size="large" tip="Processing & Normalizing Data..." /></div>}

          {/* RESULTS */}
          {processedData && processedData.isReady && (
            <Tabs defaultActiveKey="1" type="card">
                
                {/* TAB 1: DASHBOARD & DOWNLOAD */}
                <TabPane tab={<span><DatabaseOutlined /> Download Data</span>} key="1">
                    <Row gutter={[24, 24]}>
                        <Col xs={24} lg={16}>
                            <Row gutter={[16, 16]}>
                                <Col span={8}><Card size="small"><Statistic title="Customers" value={processedData.stats.customers} /></Card></Col>
                                <Col span={8}><Card size="small"><Statistic title="Invoices" value={processedData.stats.invoices} prefix={<FileExcelOutlined />} /></Card></Col>
                                <Col span={8}><Card size="small"><Statistic title="Payments" value={processedData.stats.payments} prefix={<BankOutlined />} /></Card></Col>
                                <Col span={8}><Card size="small"><Statistic title="Returns" value={processedData.stats.returns} prefix={<RollbackOutlined />} /></Card></Col>
                                <Col span={8}><Card size="small"><Statistic title="Non Faktur" value={processedData.stats.non_faktur} prefix={<WalletOutlined />} /></Card></Col>
                                <Col span={16}>
                                    <Alert 
                                        message="Validation Status" 
                                        description={`${processedData.stats.voids} Rows invalid/voided.`} 
                                        type={processedData.stats.voids > 0 ? "warning" : "success"} 
                                        showIcon 
                                    />
                                </Col>
                            </Row>
                        </Col>
                        <Col xs={24} lg={8}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <Button type="primary" size="large" icon={<DatabaseOutlined />} onClick={() => downloadJson(processedData, "RDTB_FULL_IMPORT")}>
                                    DOWNLOAD FULL DB (FLAT)
                                </Button>
                                <Divider style={{margin: '5px 0'}}>Parsial (Path)</Divider>
                                <Button size="small" onClick={() => downloadJson(processedData.products, "products")}>0. products</Button>
                                <Button size="small" onClick={() => downloadJson(processedData.customers, "customers")}>1. customers</Button>
                                <Button size="small" onClick={() => downloadJson(processedData.invoices, "invoices")}>2. invoices (Header)</Button>
                                <Button size="small" onClick={() => downloadJson(processedData.invoice_items, "invoice_items")}>3. invoice_items</Button>
                                <Button size="small" onClick={() => downloadJson(processedData.payments, "payments")}>4. payments</Button>
                                <Button size="small" onClick={() => downloadJson(processedData.non_faktur, "non_faktur")}>4b. non_faktur</Button>
                                <Button size="small" onClick={() => downloadJson(processedData.payment_allocations, "payment_allocations")}>5. payment_allocations</Button>
                                <Button size="small" onClick={() => downloadJson(processedData.returns, "returns")}>6. returns</Button>
                                <Button size="small" onClick={() => downloadJson(processedData.return_items, "return_items")}>7. return_items</Button>
                                <Button size="small" onClick={() => downloadJson(processedData.stock_history, "stock_history")}>8. stock_history</Button>
                            </div>
                        </Col>
                    </Row>
                </TabPane>

                {/* TAB 2: VOID TABLE */}
                <TabPane tab={<span><StopOutlined /> Void Data</span>} key="2">
                     <div style={{ marginBottom: 16 }}>
                        <Button 
                            type="primary" 
                            danger 
                            icon={<DownloadOutlined />} 
                            onClick={() => downloadJson(processedData.voidedRows, "voided_rows")}
                            disabled={processedData.voidedRows.length === 0}
                        >
                            Download Void Data (.json)
                        </Button>
                    </div>
                    <Table dataSource={processedData.voidedRows} columns={voidColumns} pagination={{ pageSize: 10 }} size="small" rowKey="id" />
                </TabPane>

                {/* TAB 3: JSON PREVIEW */}
                <TabPane tab={<span><CodeOutlined /> JSON Preview</span>} key="3">
                    <Collapse accordion>
                        <Panel header="Example: Payment (Flat)" key="1">
                            <pre style={{fontSize: 10, background: '#f5f5f5', padding: 10}}>{JSON.stringify(Object.values(processedData.payments)[0] || {}, null, 2)}</pre>
                        </Panel>
                        <Panel header="Example: Non Faktur (Flat)" key="2">
                            <pre style={{fontSize: 10, background: '#f5f5f5', padding: 10}}>{JSON.stringify(Object.values(processedData.non_faktur)[0] || {}, null, 2)}</pre>
                        </Panel>
                        <Panel header="Example: Invoice (Flat)" key="3">
                            <pre style={{fontSize: 10, background: '#f5f5f5', padding: 10}}>{JSON.stringify(Object.values(processedData.invoices)[0] || {}, null, 2)}</pre>
                        </Panel>
                    </Collapse>
                </TabPane>

            </Tabs>
          )}
      </Card>
    </div>
  );
}