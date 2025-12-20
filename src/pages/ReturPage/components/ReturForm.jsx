import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Modal, Form, Input, InputNumber, DatePicker, Button,
    message, List, Row, Col, Empty, Tag, Spin, Divider, Select, Checkbox, Typography
} from 'antd';
import { DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

// --- IMPORTS FIREBASE ---
import { db } from '../../../api/firebase'; 
import {
    ref, update, get, query, orderByChild, equalTo, orderByKey, startAt, endAt
} from "firebase/database";

import { usePelangganStream } from '../../../hooks/useFirebaseData';

const { Option } = Select;
const { Text } = Typography;

// Formatter
const formatRupiah = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

// --- HELPER LIST ITEM ---
const ReturnItemRow = React.memo(({ item, isSelected, returnQty, onToggle, onQtyChange, readOnly }) => {
    const harga = Number(item.harga) || 0;
    const qty = Number(returnQty) || 0;
    const diskonPersen = Number(item.diskonPersen) || 0;
    
    // Hitungan per baris
    const bruto = harga * qty;
    const nilaiDiskon = bruto * (diskonPersen / 100);
    const netto = bruto - nilaiDiskon;

    return (
        <List.Item 
            style={{ 
                padding: '8px 12px', 
                background: isSelected ? '#e6f7ff' : '#fff',
                borderBottom: '1px solid #f0f0f0',
            }}
            actions={!readOnly ? [
                 <Checkbox checked={isSelected} onChange={(e) => onToggle(item.id, e.target.checked)} />
            ] : []}
        >
            <div style={{ width: '100%' }}>
                <Row align="middle" gutter={8}>
                    <Col flex="auto">
                        <div style={{ fontWeight: 'bold', fontSize: 13 }}>{item.judul || item.productName || 'Produk'}</div>
                        <div style={{ fontSize: 11, color: '#666' }}>
                            Beli: <b>{item.qty}</b> x {formatRupiah(harga)}
                            {diskonPersen > 0 && <Tag color="red" style={{marginLeft: 5, fontSize: 10}}>-{diskonPersen}%</Tag>}
                        </div>
                    </Col>
                    <Col>
                        {readOnly ? (
                            <div style={{textAlign: 'right'}}>
                                <div style={{fontSize: 10}}>Qty Retur: {qty}</div>
                                <div style={{fontWeight:'bold', color: '#1890ff'}}>{formatRupiah(netto)}</div>
                            </div>
                        ) : (
                            isSelected ? (
                                <div style={{textAlign: 'right'}}>
                                    <InputNumber
                                        value={qty}
                                        onChange={(v) => onQtyChange(v, item.id)}
                                        style={{ width: 70, fontSize: 13, marginBottom: 4 }}
                                        min={1} max={item.qty} size="small"
                                    />
                                    <div style={{fontSize: 11, fontWeight:'bold', color: '#1890ff'}}>
                                        {formatRupiah(netto)}
                                    </div>
                                    {diskonPersen > 0 && (
                                        <div style={{fontSize: 10, color: '#ff4d4f'}}>
                                            (Disc: {formatRupiah(nilaiDiskon)})
                                        </div>
                                    )}
                                </div>
                            ) : <Tag>Tidak</Tag>
                        )}
                    </Col>
                </Row>
            </div>
        </List.Item>
    );
});

const ReturForm = ({ open, onCancel, initialValues }) => {
    const [form] = Form.useForm();
    const [modal, contextHolder] = Modal.useModal(); // Hook Modal
    
    // Watchers
    const watchedTotalDiskon = Form.useWatch('totalDiskon', form); 
    const selectedDate = Form.useWatch('tanggal', form);

    const { pelangganList: rawPelangganData, loadingPelanggan } = usePelangganStream();
    
    // --- STATE ---
    const [selectedCustomerName, setSelectedCustomerName] = useState(null);
    const [selectedCustomerId, setSelectedCustomerId] = useState(null);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
    const [invoiceOptions, setInvoiceOptions] = useState([]); 

    const [sourceItems, setSourceItems] = useState([]); 
    const [selectedItemIds, setSelectedItemIds] = useState([]); 
    const [returnQtys, setReturnQtys] = useState({}); 

    const [isSearching, setIsSearching] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isGeneratingId, setIsGeneratingId] = useState(false);
    const [loadingItems, setLoadingItems] = useState(false);

    const pelangganList = useMemo(() => {
        if (!rawPelangganData) return [];
        let processed = Array.isArray(rawPelangganData) 
            ? rawPelangganData 
            : Object.keys(rawPelangganData).map(k => ({ id: k, ...rawPelangganData[k] }));
        return processed.map(p => ({ ...p, displayName: p.nama || p.name || `(ID:${p.id})` }));
    }, [rawPelangganData]);

    // --- KALKULASI TOTAL ---
    const totalBruto = useMemo(() => {
        let total = 0;
        selectedItemIds.forEach(itemId => {
            const item = sourceItems.find(i => i.id === itemId);
            const qty = returnQtys[itemId] || 0;
            if (item && qty > 0) {
                total += (Number(item.harga) || 0) * qty;
            }
        });
        return total;
    }, [selectedItemIds, returnQtys, sourceItems]);

    const calculatedAutoDiskon = useMemo(() => {
        let totalDisc = 0;
        selectedItemIds.forEach(itemId => {
            const item = sourceItems.find(i => i.id === itemId);
            const qty = returnQtys[itemId] || 0;
            const discP = Number(item.diskonPersen) || 0;
            if (item && qty > 0 && discP > 0) {
                const brutoItem = (Number(item.harga) || 0) * qty;
                totalDisc += Math.round(brutoItem * (discP / 100));
            }
        });
        return totalDisc;
    }, [selectedItemIds, returnQtys, sourceItems]);

    useEffect(() => {
        if (!initialValues) {
            form.setFieldsValue({ totalDiskon: calculatedAutoDiskon });
        }
    }, [calculatedAutoDiskon, form, initialValues]);

    const grandTotalRetur = useMemo(() => {
        const diskonInput = Number(watchedTotalDiskon) || 0;
        return Math.max(0, totalBruto - diskonInput);
    }, [totalBruto, watchedTotalDiskon]);


    // --- INITIAL LOAD & EDIT MODE ---
    useEffect(() => {
        if (open) {
            resetFormState();
            if (initialValues) {
                // VIEW MODE
                form.setFieldsValue({
                    id: initialValues.id,
                    tanggal: dayjs(initialValues.tanggal),
                    keterangan: initialValues.keterangan,
                    totalDiskon: initialValues.totalDiskon || 0 
                });
                setSelectedCustomerName(initialValues.namaCustomer);
                setSelectedInvoiceId(initialValues.invoiceId);
                loadEditData(initialValues.invoiceId, initialValues.id);
            } else {
                // CREATE MODE
                form.resetFields();
                form.setFieldsValue({ tanggal: dayjs(), keterangan: '', totalDiskon: 0 });
            }
        }
    }, [initialValues, open, form]);

    const resetFormState = () => {
        form.resetFields();
        setSelectedCustomerName(null);
        setSelectedCustomerId(null);
        setSelectedInvoiceId(null);
        setInvoiceOptions([]);
        setSourceItems([]);
        setSelectedItemIds([]);
        setReturnQtys({});
        setLoadingItems(false);
    };

    // --- HELPER: FETCH INVOICE ITEMS ---
    const fetchInvoiceItemsHelper = async (invId) => {
        try {
            const q = query(ref(db, 'invoice_items'), orderByChild('invoiceId'), equalTo(invId));
            const snap = await get(q);
            let items = [];
            if (snap.exists()) {
                snap.forEach(c => {
                    const val = c.val();
                    items.push({ id: c.key, ...val });
                });
            } else {
                const invSnap = await get(ref(db, `invoices/${invId}/items`));
                if(invSnap.exists()){
                    const raw = invSnap.val();
                    const legacyItems = Array.isArray(raw) ? raw : Object.keys(raw).map(k=>({id:k, ...raw[k]}));
                    legacyItems.forEach(item => {
                        items.push({
                            id: `LEGACY_${item.idBuku || Math.random()}`,
                            productId: item.idBuku,
                            judul: item.nama || item.judul,
                            qty: item.jumlah || item.qty,
                            harga: item.hargaSatuan || item.harga,
                            diskonPersen: item.diskon || item.diskonPersen || 0
                        });
                    });
                }
            }
            return items;
        } catch (e) { 
            console.error("Err fetch items", e);
            return [];
        }
    };

    // --- LOAD EDIT DATA ---
    const loadEditData = async (invoiceId, returnId) => {
        setLoadingItems(true);
        try {
            const invoiceItems = await fetchInvoiceItemsHelper(invoiceId);
            setSourceItems(invoiceItems);

            const qRetur = query(ref(db, 'return_items'), orderByChild('returnId'), equalTo(returnId));
            const snapRetur = await get(qRetur);
            
            if (snapRetur.exists()) {
                const returData = snapRetur.val();
                const idsToSelect = [];
                const qtysMap = {};

                Object.values(returData).forEach(rItem => {
                    const match = invoiceItems.find(invItem => 
                        (invItem.productId && invItem.productId === rItem.productId) || 
                        (invItem.judul === rItem.judul)
                    );
                    if (match) {
                        idsToSelect.push(match.id);
                        qtysMap[match.id] = rItem.qty;
                    }
                });

                setSelectedItemIds(idsToSelect);
                setReturnQtys(qtysMap);
            }
        } catch (err) {
            console.error(err);
            message.error("Gagal memuat detail transaksi");
        } finally {
            setLoadingItems(false);
        }
    };

    // --- AUTO GENERATE ID ---
    useEffect(() => {
        if (initialValues || !open) return;
        let isMounted = true;
        setIsGeneratingId(true);
        const generateId = async () => {
            try {
                const dateBasis = selectedDate ? dayjs(selectedDate) : dayjs();
                const dateFormat = dateBasis.format('YYMMDD');
                const keyPrefix = `RJ-${dateFormat}-`;
                const q = query(ref(db, 'returns'), orderByKey(), startAt(keyPrefix), endAt(keyPrefix + '\uf8ff'));
                const snapshot = await get(q);
                let nextNum = 1;
                if (snapshot.exists()) {
                    const keys = Object.keys(snapshot.val()).sort();
                    const lastKey = keys[keys.length - 1];
                    const parts = lastKey.split('-');
                    const lastSeq = parseInt(parts[parts.length - 1]);
                    if (!isNaN(lastSeq)) nextNum = lastSeq + 1;
                }
                if (isMounted) form.setFieldsValue({ id: `${keyPrefix}${String(nextNum).padStart(3, '0')}` });
            } catch (error) { console.error(error); } 
            finally { if (isMounted) setIsGeneratingId(false); }
        };
        generateId();
        return () => { isMounted = false; };
    }, [initialValues, open, selectedDate, form]);

    // --- HANDLERS ---
    const handleCustomerSelect = async (val, option) => {
        setSelectedCustomerName(val);
        setSelectedCustomerId(option.key);
        setSelectedInvoiceId(null);
        setSourceItems([]);
        setSelectedItemIds([]);
        setIsSearching(true);
        try {
            const q = query(ref(db, 'invoices'), orderByChild('namaCustomer'), equalTo(val));
            const snap = await get(q);
            const options = [];
            if (snap.exists()) {
                snap.forEach(child => {
                    const inv = child.val();
                    const status = inv.statusPembayaran || 'BELUM';
                    const color = status === 'LUNAS' ? 'success' : 'warning';
                    options.push({
                        id: child.key,
                        dateFormatted: dayjs(inv.tanggal).format('DD/MM/YY'),
                        totalNetto: formatRupiah(inv.totalNetto),
                        status: status,
                        statusColor: color,
                        raw: inv
                    });
                });
            }
            options.sort((a,b) => b.id.localeCompare(a.id));
            setInvoiceOptions(options);
        } catch (err) { message.error("Gagal ambil invoice"); } 
        finally { setIsSearching(false); }
    };

    const handleInvoiceSelect = async (invId) => {
        setSelectedInvoiceId(invId);
        setLoadingItems(true);
        setSelectedItemIds([]);
        setReturnQtys({});
        try {
            const items = await fetchInvoiceItemsHelper(invId);
            if(items.length > 0) setSourceItems(items);
            else { message.warning("Invoice kosong detail"); setSourceItems([]); }
        } catch (err) { 
            console.error(err);
            message.error("Gagal ambil item invoice"); 
        } 
        finally { setLoadingItems(false); }
    };

    const handleToggleItem = (itemId, checked) => {
        if (checked) {
            setSelectedItemIds(prev => [...prev, itemId]);
            setReturnQtys(prev => ({ ...prev, [itemId]: 1 })); 
        } else {
            setSelectedItemIds(prev => prev.filter(id => id !== itemId));
            setReturnQtys(prev => { const c={...prev}; delete c[itemId]; return c; });
        }
    };

    const handleQtyChange = (val, itemId) => setReturnQtys(prev => ({ ...prev, [itemId]: val }));

    // --- SAVE LOGIC ---
    const handleSave = async (values) => {
        if (grandTotalRetur <= 0 && selectedItemIds.length > 0 && values.totalDiskon >= totalBruto) {
             return message.error("Total diskon tidak boleh melebihi total retur.");
        }
        if (selectedItemIds.length === 0) return message.error("Pilih item yang diretur.");

        setIsSaving(true);
        message.loading({ content: 'Memproses Retur...', key: 'save' });

        try {
            const timestampNow = Date.now();
            const returId = values.id; 
            const updates = {};
            const finalDiskon = Number(values.totalDiskon) || 0;

            const returData = {
                id: returId,
                tanggal: dayjs(values.tanggal).valueOf(),
                customerId: selectedCustomerId || 'UNKNOWN',
                namaCustomer: selectedCustomerName,
                invoiceId: selectedInvoiceId,
                keterangan: values.keterangan || '-',
                sumber: 'SALES_RETURN',
                arah: 'IN',
                totalDiskon: finalDiskon,
                totalRetur: grandTotalRetur,
                createdAt: timestampNow,
                updatedAt: timestampNow
            };
            updates[`returns/${returId}`] = returData;

            // Update Invoice
            const invSnap = await get(ref(db, `invoices/${selectedInvoiceId}`));
            if (!invSnap.exists()) throw new Error("Invoice tidak ditemukan");
            const curInv = invSnap.val();
            const oldRetur = Number(curInv.totalRetur) || 0;
            const oldNetto = Number(curInv.totalNetto) || 0;
            const currentBayar = Number(curInv.totalBayar) || 0;
            
            // Hitung Netto Baru
            const newTotalRetur = oldRetur + grandTotalRetur;
            const newTotalNetto = oldNetto - grandTotalRetur;

            // 🔥 CEK LUNAS (Logic Save)
            let newStatus = curInv.statusPembayaran || 'BELUM';
            if (newTotalNetto <= 0 || currentBayar >= newTotalNetto) {
                newStatus = 'LUNAS';
            }

            const finalCustomerName = curInv.namaCustomer || selectedCustomerName || 'UNKNOWN';
            const newComposite = `${finalCustomerName.toUpperCase()}_${newStatus}`;

            updates[`invoices/${selectedInvoiceId}/totalRetur`] = newTotalRetur;
            updates[`invoices/${selectedInvoiceId}/totalNetto`] = newTotalNetto;
            updates[`invoices/${selectedInvoiceId}/statusPembayaran`] = newStatus;
            updates[`invoices/${selectedInvoiceId}/compositeStatus`] = newComposite;
            updates[`invoices/${selectedInvoiceId}/updatedAt`] = timestampNow;

            // Items
            for (const itemId of selectedItemIds) {
                const source = sourceItems.find(i => i.id === itemId);
                const qtyRetur = returnQtys[itemId];
                const harga = Number(source.harga) || 0;
                
                const rItemId = `RITEM_${returId}_${Math.floor(Math.random() * 100000)}`;
                updates[`return_items/${rItemId}`] = {
                    id: rItemId,
                    returnId: returId,
                    productId: source.productId || '-',
                    judul: source.judul || source.productName || '-',
                    qty: qtyRetur,
                    harga: harga,
                    diskonPersen: source.diskonPersen || 0,
                    subtotal: qtyRetur * harga,
                    createdAt: timestampNow,
                    updatedAt: timestampNow
                };

                if (source.productId) {
                    const prodRef = ref(db, `products/${source.productId}`);
                    const prodSnap = await get(prodRef);
                    if (prodSnap.exists()) {
                        const stokAwal = Number(prodSnap.val().stok) || 0;
                        const stokAkhir = stokAwal + qtyRetur; 

                        updates[`products/${source.productId}/stok`] = stokAkhir;

                        const histId = `HIST_${returId}_${source.productId}_${timestampNow}`;
                        updates[`stock_history/${histId}`] = {
                            id: histId,
                            bukuId: source.productId,
                            judul: source.judul || source.productName,
                            nama: "ADMIN",
                            refId: returId,
                            keterangan: `Retur Invoice: ${selectedInvoiceId}`,
                            perubahan: qtyRetur, 
                            stokAwal: stokAwal,
                            stokAkhir: stokAkhir,
                            tanggal: timestampNow,
                            createdAt: timestampNow,
                            updatedAt: timestampNow
                        };
                    }
                }
            }

            await update(ref(db), updates);
            message.success({ content: `Retur ${returId} Berhasil!`, key: 'save' });
            onCancel();
        } catch (e) {
            console.error(e);
            message.error({ content: "Gagal: " + e.message, key: 'save' });
        } finally { setIsSaving(false); }
    };

    // --- DELETE HANDLER (REVERT / ROLLBACK) ---
    const handleDelete = () => {
        modal.confirm({
            title: 'Hapus & Revert Retur?',
            content: 'Data retur dihapus, saldo invoice dikembalikan (Netto naik), stok produk dikurangi kembali.',
            okType: 'danger',
            onOk: async () => {
                setIsSaving(true);
                try {
                    // 1. Siapkan Data
                    const returId = initialValues.id;
                    const invId = initialValues.invoiceId;
                    const totalReturVal = Number(initialValues.totalRetur) || 0; 
                    const timestampNow = Date.now();

                    const updates = {};
                    
                    // 2. HAPUS HEADER RETUR
                    updates[`returns/${returId}`] = null; 

                    // 3. UPDATE INVOICE (KEMBALIKAN SALDO & CEK STATUS)
                    if (invId) {
                        const invSnap = await get(ref(db, `invoices/${invId}`));
                        if (invSnap.exists()) {
                            const curInv = invSnap.val();
                            const curRetur = Number(curInv.totalRetur) || 0;
                            const curNetto = Number(curInv.totalNetto) || 0;
                            const curBayar = Number(curInv.totalBayar) || 0; // Ambil total yang sudah dibayar
                            
                            // A. Hitung Angka Baru (Revert)
                            const newTotalRetur = Math.max(0, curRetur - totalReturVal);
                            const newTotalNetto = curNetto + totalReturVal; // Netto NAIK LAGI

                            // B. Cek Status Pembayaran (Re-Evaluate)
                            // Jika Hutang (Netto) naik, apakah uang yg sudah dibayar masih cukup?
                            // Logika: Jika Bayar < Netto -> BELUM LUNAS
                            let newStatus = 'BELUM';
                            if (curBayar >= (newTotalNetto - 100)) {
                                newStatus = 'LUNAS';
                            }

                            // C. Update Composite Key
                            const customerName = curInv.namaCustomer || 'UNKNOWN';
                            const newComposite = `${customerName.toUpperCase()}_${newStatus}`;

                            updates[`invoices/${invId}/totalRetur`] = newTotalRetur;
                            updates[`invoices/${invId}/totalNetto`] = newTotalNetto;
                            updates[`invoices/${invId}/statusPembayaran`] = newStatus; // Update Status
                            updates[`invoices/${invId}/compositeStatus`] = newComposite;
                            updates[`invoices/${invId}/updatedAt`] = Date.now();
                        }
                    }

                    // 4. AMBIL ITEM RETUR UNTUK REVERT STOK
                    const rQuery = query(ref(db, 'return_items'), orderByChild('returnId'), equalTo(returId));
                    const rSnap = await get(rQuery);

                    if (rSnap.exists()) {
                        const itemsToDelete = rSnap.val();
                        
                        for (const key in itemsToDelete) {
                            const rItem = itemsToDelete[key];
                            
                            // 5. HAPUS ITEM RETUR
                            updates[`return_items/${key}`] = null;

                            // 6. UPDATE STOK (BARANG KELUAR LAGI)
                            if (rItem.productId) {
                                const prodSnap = await get(ref(db, `products/${rItem.productId}`));
                                if (prodSnap.exists()) {
                                    const stokAwal = Number(prodSnap.val().stok) || 0;
                                    const qtyBalik = Number(rItem.qty) || 0; 
                                    
                                    const stokAkhir = stokAwal - qtyBalik;

                                    updates[`products/${rItem.productId}/stok`] = stokAkhir;

                                    // 7. HISTORY STOK
                                    const histId = `HIST_DEL_${returId}_${rItem.productId}_${timestampNow}`;
                                    updates[`stock_history/${histId}`] = {
                                        id: histId,
                                        bukuId: rItem.productId,
                                        judul: rItem.judul || 'Unknown Product',
                                        nama: "ADMIN",
                                        refId: returId,
                                        keterangan: `Revert/Hapus Retur ${returId}`,
                                        perubahan: -qtyBalik, 
                                        stokAwal: stokAwal,
                                        stokAkhir: stokAkhir,
                                        tanggal: timestampNow,
                                        createdAt: timestampNow,
                                        updatedAt: timestampNow
                                    };
                                }
                            }
                        }
                    }

                    // EKSEKUSI
                    await update(ref(db), updates);
                    
                    message.success('Retur dihapus. Saldo & Status Invoice diperbarui.');
                    onCancel();
                } catch (e) { 
                    console.error(e);
                    message.error(e.message); 
                } 
                finally { setIsSaving(false); }
            }
        });
    };

    return (
        <>
            {contextHolder}
            <Modal
                style={{ top: 20 }}
                open={open}
                title={initialValues ? `Detail Retur` : "Input Retur Penjualan"}
                onCancel={onCancel}
                width={800}
                maskClosable={false}
                footer={[
                    initialValues && (
                        <Button 
                            key="d" 
                            danger 
                            icon={<DeleteOutlined />} 
                            onClick={handleDelete} 
                            loading={isSaving} 
                        >
                            Hapus & Revert
                        </Button>
                    ),
                    <Button key="b" onClick={onCancel} disabled={isSaving}>Batal</Button>,
                    !initialValues && (
                        <Button key="s" type="primary" loading={isSaving} icon={<SaveOutlined />} onClick={() => form.submit()}>
                            Simpan
                        </Button>
                    )
                ]}
            >
                <Spin spinning={isGeneratingId}>
                    <Form form={form} layout="vertical" onFinish={handleSave}>
                        <Row gutter={12}>
                            <Col span={12}>
                                <Form.Item name="id" label="No. Retur">
                                    <Input disabled style={{fontWeight: 'bold'}} placeholder="Auto..." />
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item name="tanggal" label="Tanggal Retur" rules={[{ required: true }]}>
                                    <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabled={!!initialValues} allowClear={false} />
                                </Form.Item>
                            </Col>
                        </Row>

                        {!initialValues && (
                            <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                                <Row gutter={16}>
                                    <Col span={12}>
                                        <Form.Item label="1. Customer" required style={{marginBottom:0}}>
                                            <Select showSearch placeholder="Pilih Customer..." onChange={handleCustomerSelect} value={selectedCustomerName} loading={loadingPelanggan} filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())}>
                                                {pelangganList.map(p => (<Option key={p.id} value={p.displayName}>{p.displayName}</Option>))}
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item label="2. Invoice" style={{marginBottom:0}}>
                                            <Select 
                                                placeholder={isSearching ? "Mencari..." : "Pilih Invoice..."} 
                                                disabled={!selectedCustomerName} 
                                                onChange={handleInvoiceSelect} 
                                                value={selectedInvoiceId}
                                                optionLabelProp="value" 
                                                dropdownMatchSelectWidth={false}
                                                style={{width: '100%'}}
                                            >
                                                {invoiceOptions.map(inv => (
                                                    <Option key={inv.id} value={inv.id}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minWidth: 300 }}>
                                                            <div style={{marginRight: 15}}>
                                                                <strong>{inv.id}</strong><br/>
                                                                <span style={{fontSize: 11, color: '#888'}}>{inv.dateFormatted}</span>
                                                            </div>
                                                            <div style={{textAlign: 'right'}}>
                                                                <Tag color={inv.statusColor}>{inv.status}</Tag><br/>
                                                                <span style={{fontSize: 12}}>{inv.totalNetto}</span>
                                                            </div>
                                                        </div>
                                                    </Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </div>
                        )}
                        
                        <Form.Item name="keterangan" label="Keterangan">
                            <Input disabled={!!initialValues}/>
                        </Form.Item>

                        <Divider orientation="left">Item Retur</Divider>
                        <div style={{ border: '1px solid #d9d9d9', borderRadius: 8, minHeight: 200, maxHeight: 350, overflowY: 'auto' }}>
                            {loadingItems ? <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div> : sourceItems.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Pilih invoice dulu" style={{margin: '40px 0'}} /> : (
                                <List dataSource={sourceItems} renderItem={(item) => (
                                    <ReturnItemRow 
                                        key={item.id} 
                                        item={item} 
                                        isSelected={selectedItemIds.includes(item.id)} 
                                        returnQty={returnQtys[item.id]} 
                                        onToggle={handleToggleItem} 
                                        onQtyChange={handleQtyChange} 
                                        readOnly={!!initialValues} 
                                    />
                                )} />
                            )}
                        </div>
                        
                        <div style={{ marginTop: 16, padding: 12, background: '#fafafa', borderRadius: 6, border: '1px solid #eee' }}>
                                <Row gutter={16} align="middle">
                                <Col span={12} style={{textAlign: 'right'}}>
                                    <Text type="secondary">Total Bruto Item:</Text>
                                </Col>
                                <Col span={12} style={{textAlign: 'right'}}>
                                    <Text strong>{formatRupiah(totalBruto)}</Text>
                                </Col>
                                </Row>
                                <Row gutter={16} align="middle" style={{marginTop: 8}}>
                                <Col span={12} style={{textAlign: 'right'}}>
                                    <div style={{display:'flex', alignItems:'center', justifyContent:'flex-end'}}>
                                        <Text type="secondary" style={{marginRight: 8}}>Potongan / Diskon (Rp):</Text>
                                        <Form.Item name="totalDiskon" style={{marginBottom: 0, width: 140}}>
                                            <InputNumber 
                                                disabled={!!initialValues}
                                                formatter={value => `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                                parser={value => value.replace(/\Rp\s?|(,*)/g, '')}
                                                style={{width: '100%', textAlign: 'right'}}
                                                placeholder="0"
                                            />
                                        </Form.Item>
                                    </div>
                                </Col>
                                <Col span={12} style={{textAlign: 'right'}}>
                                    <Text type="danger">- {formatRupiah(Number(watchedTotalDiskon) || 0)}</Text>
                                </Col>
                                </Row>
                                
                                <Divider style={{margin: '12px 0'}} />
                                
                                <Row gutter={16} align="middle">
                                    <Col span={12} style={{textAlign: 'right'}}>
                                        <Text style={{fontSize: 16}}>Total Retur Bersih:</Text>
                                    </Col>
                                    <Col span={12} style={{textAlign: 'right'}}>
                                        <Text style={{fontSize: 20, color: '#1890ff'}} strong>
                                            {initialValues ? formatRupiah(initialValues.totalRetur) : formatRupiah(grandTotalRetur)}
                                        </Text>
                                    </Col>
                                </Row>
                        </div>
                    </Form>
                </Spin>
            </Modal>
        </>
    );
};

export default ReturForm;