import React, { useState, useEffect, useMemo } from 'react';
import {
    Modal, Form, Input, InputNumber, DatePicker, Button,
    message, List, Row, Col, Empty, Tag, Spin, Divider, Select, Checkbox
} from 'antd';
import { DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

// --- IMPORTS FIREBASE ---
import { db } from '../../../api/firebase'; 
import {
    ref, update, get, query, orderByChild, equalTo, limitToLast, orderByKey, startAt, endAt
} from "firebase/database";

import { usePelangganStream } from '../../../hooks/useFirebaseData';

const { Option } = Select;

// Formatter
const formatRupiah = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

// Helper List Item
const ReturnItemRow = React.memo(({ item, isSelected, returnQty, onToggle, onQtyChange, readOnly }) => {
    const subtotalRetur = (Number(item.harga) || 0) * (Number(returnQty) || 0);

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
                            Beli: <b>{item.qty}</b> x {formatRupiah(item.harga)}
                        </div>
                    </Col>
                    <Col>
                        {readOnly ? (
                            <div style={{textAlign: 'right'}}>
                                <div style={{fontSize: 10}}>Qty Retur: {returnQty}</div>
                                <div style={{fontWeight:'bold', color: '#1890ff'}}>{formatRupiah(subtotalRetur)}</div>
                            </div>
                        ) : (
                            isSelected ? (
                                <div style={{textAlign: 'right'}}>
                                    <InputNumber
                                        value={returnQty}
                                        onChange={(v) => onQtyChange(v, item.id)}
                                        style={{ width: 70, fontSize: 13 }}
                                        min={1} max={item.qty} size="small"
                                    />
                                    <div style={{fontSize: 11, fontWeight:'bold', color: '#1890ff'}}>{formatRupiah(subtotalRetur)}</div>
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
    const [modal, contextHolder] = Modal.useModal();

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
    const [loadingItems, setLoadingItems] = useState(false);

    const pelangganList = useMemo(() => {
        if (!rawPelangganData) return [];
        let processed = Array.isArray(rawPelangganData) 
            ? rawPelangganData 
            : Object.keys(rawPelangganData).map(k => ({ id: k, ...rawPelangganData[k] }));
        return processed.map(p => ({ ...p, displayName: p.nama || p.name || `(ID:${p.id})` }));
    }, [rawPelangganData]);

    const grandTotalRetur = useMemo(() => {
        let total = 0;
        selectedItemIds.forEach(itemId => {
            const item = sourceItems.find(i => i.id === itemId);
            const qty = returnQtys[itemId] || 0;
            if (item && qty > 0) total += (Number(item.harga) || 0) * qty;
        });
        return total;
    }, [selectedItemIds, returnQtys, sourceItems]);

    useEffect(() => {
        if (open) {
            resetFormState();
            if (initialValues) {
                // VIEW MODE
                form.setFieldsValue({
                    tanggal: dayjs(initialValues.tanggal),
                    keterangan: initialValues.keterangan,
                    id: initialValues.id
                });
                setSelectedCustomerName(initialValues.namaCustomer);
                setSelectedInvoiceId(initialValues.invoiceId); // Penting untuk revert
                fetchExistingReturnItems(initialValues.id);
            } else {
                form.setFieldsValue({ tanggal: dayjs(), keterangan: '' });
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

    const fetchExistingReturnItems = async (returnId) => {
        setLoadingItems(true);
        try {
            const q = query(ref(db, 'return_items'), orderByChild('returnId'), equalTo(returnId));
            const snap = await get(q);
            if (snap.exists()) {
                const data = snap.val();
                const itemsArr = Object.keys(data).map(k => ({ ...data[k], id: k }));
                setSourceItems(itemsArr); 
                setSelectedItemIds(itemsArr.map(i => i.id));
                const qtyMap = {};
                itemsArr.forEach(i => qtyMap[i.id] = i.qty);
                setReturnQtys(qtyMap);
            }
        } catch (err) {
            message.error("Gagal memuat item");
        } finally {
            setLoadingItems(false);
        }
    };

    // --- GENERATE ID: RJ-YY-MM-DD-XXXX ---
    const generateReturId = async (dateObj) => {
        const d = dayjs(dateObj);
        const prefix = `RJ-${d.format('YY-MM-DD')}-`;
        
        try {
            const q = query(ref(db, 'returns'), orderByKey(), startAt(prefix), endAt(prefix + '\uf8ff'), limitToLast(1));
            const snap = await get(q);
            let nextNum = 1;
            if (snap.exists()) {
                const key = Object.keys(snap.val())[0];
                const parts = key.split('-');
                const lastSeq = parseInt(parts[parts.length - 1]);
                if (!isNaN(lastSeq)) nextNum = lastSeq + 1;
            }
            return `${prefix}${String(nextNum).padStart(4, '0')}`;
        } catch (e) {
            // Fallback random jika gagal
            return `${prefix}${Date.now().toString().slice(-4)}`;
        }
    };

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
                    options.push({ id: child.key, label: `${child.key} - ${dayjs(inv.tanggal).format('DD/MM/YY')} (Netto: ${formatRupiah(inv.totalNetto)})` });
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
            const q = query(ref(db, 'invoice_items'), orderByChild('invoiceId'), equalTo(invId));
            const snap = await get(q);
            let items = [];
            if (snap.exists()) snap.forEach(c => items.push({ id: c.key, ...c.val() }));
            else {
                const invSnap = await get(ref(db, `invoices/${invId}/items`));
                if(invSnap.exists()){
                    const raw = invSnap.val();
                    items = Array.isArray(raw) ? raw : Object.keys(raw).map(k=>({id:k, ...raw[k]}));
                }
            }
            if(items.length > 0) setSourceItems(items);
            else { message.warning("Invoice kosong detail"); setSourceItems([]); }
        } catch (err) { message.error("Gagal ambil item"); } 
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

    // --- SAVE LOGIC (ATOMIC UPDATE) ---
    const handleSave = async (values) => {
        if (grandTotalRetur <= 0 || selectedItemIds.length === 0) return message.error("Item/Qty tidak valid.");
        setIsSaving(true);
        message.loading({ content: 'Memproses Retur...', key: 'save' });

        try {
            const timestampNow = Date.now();
            const returId = await generateReturId(values.tanggal);
            const updates = {};

            // 1. HEADER (returns)
            const returData = {
                id: returId,
                tanggal: dayjs(values.tanggal).valueOf(),
                customerId: selectedCustomerId || 'UNKNOWN',
                namaCustomer: selectedCustomerName,
                invoiceId: selectedInvoiceId,
                keterangan: values.keterangan || '-',
                sumber: 'SALES_RETURN',
                arah: 'IN',
                totalRetur: grandTotalRetur,
                createdAt: timestampNow,
                updatedAt: timestampNow
            };
            updates[`returns/${returId}`] = returData;

            // 2. INVOICE (Update Total)
            const invSnap = await get(ref(db, `invoices/${selectedInvoiceId}`));
            if (!invSnap.exists()) throw new Error("Invoice tidak ditemukan");
            const curInv = invSnap.val();
            const oldRetur = Number(curInv.totalRetur) || 0;
            const oldNetto = Number(curInv.totalNetto) || 0;
            
            updates[`invoices/${selectedInvoiceId}/totalRetur`] = oldRetur + grandTotalRetur;
            updates[`invoices/${selectedInvoiceId}/totalNetto`] = oldNetto - grandTotalRetur;
            updates[`invoices/${selectedInvoiceId}/updatedAt`] = timestampNow;

            // 3. ITEMS, STOK, HISTORY
            for (const itemId of selectedItemIds) {
                const source = sourceItems.find(i => i.id === itemId);
                const qtyRetur = returnQtys[itemId];
                const harga = Number(source.harga) || 0;

                // A. return_items
                const rItemId = `RITEM_${returId}_${Math.floor(Math.random() * 100000)}`;
                updates[`return_items/${rItemId}`] = {
                    id: rItemId,
                    returnId: returId,
                    productId: source.productId || '-',
                    judul: source.judul || source.productName || '-',
                    qty: qtyRetur,
                    harga: harga,
                    subtotal: qtyRetur * harga,
                    createdAt: timestampNow,
                    updatedAt: timestampNow
                };

                // B. Update Stok & Create History
                if (source.productId) {
                    const prodRef = ref(db, `products/${source.productId}`);
                    const prodSnap = await get(prodRef);
                    if (prodSnap.exists()) {
                        const stokAwal = Number(prodSnap.val().stok) || 0;
                        const stokAkhir = stokAwal + qtyRetur; // Barang masuk lagi

                        updates[`products/${source.productId}/stok`] = stokAkhir;

                        // C. Format History sesuai request
                        const histId = `HIST_${returId}_${source.productId}_${timestampNow}`;
                        updates[`stock_history/${histId}`] = {
                            id: histId,
                            bukuId: source.productId,
                            judul: source.judul || source.productName,
                            nama: "ADMIN", // Hardcode/ambil dari auth context
                            refId: returId, // Link ke Retur ID
                            keterangan: `Retur Invoice: ${selectedInvoiceId}`,
                            perubahan: qtyRetur, // Positif karena masuk
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

    // --- DELETE HANDLER (REVERT) ---
    const handleDelete = () => {
        modal.confirm({
            title: 'Hapus & Revert Retur?',
            content: 'Data retur dihapus, saldo invoice dikembalikan, stok produk dikurangi kembali.',
            okType: 'danger',
            onOk: async () => {
                setIsSaving(true);
                try {
                    const returId = initialValues.id;
                    const invId = initialValues.invoiceId;
                    const totalReturVal = Number(initialValues.totalRetur) || 0;
                    const timestampNow = Date.now();

                    const updates = {};
                    updates[`returns/${returId}`] = null; // Hapus header

                    // 1. Revert Invoice
                    if (invId) {
                        const invSnap = await get(ref(db, `invoices/${invId}`));
                        if (invSnap.exists()) {
                            const curInv = invSnap.val();
                            const curRetur = Number(curInv.totalRetur) || 0;
                            const curNetto = Number(curInv.totalNetto) || 0;
                            
                            updates[`invoices/${invId}/totalRetur`] = Math.max(0, curRetur - totalReturVal);
                            updates[`invoices/${invId}/totalNetto`] = curNetto + totalReturVal;
                        }
                    }

                    // 2. Revert Items & Stock
                    for (const item of sourceItems) {
                        updates[`return_items/${item.id}`] = null; // Hapus detail

                        if (item.productId) {
                            const prodSnap = await get(ref(db, `products/${item.productId}`));
                            if (prodSnap.exists()) {
                                const stokAwal = Number(prodSnap.val().stok) || 0;
                                const qtyBalik = Number(item.qty) || 0; 
                                const stokAkhir = stokAwal - qtyBalik; // Stok dikurangi lagi

                                updates[`products/${item.productId}/stok`] = stokAkhir;

                                // History Koreksi/Keluar
                                const histId = `HIST_DEL_${returId}_${item.productId}_${timestampNow}`;
                                updates[`stock_history/${histId}`] = {
                                    id: histId,
                                    bukuId: item.productId,
                                    judul: item.judul || item.productName,
                                    nama: "ADMIN",
                                    refId: returId,
                                    keterangan: `Revert/Hapus Retur ${returId}`,
                                    perubahan: -qtyBalik, // Negatif
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
                    message.success('Retur berhasil direvert.');
                    onCancel();
                } catch (e) { message.error(e.message); } 
                finally { setIsSaving(false); }
            }
        });
    };

    return (
        <>
            {contextHolder}
            <Modal
                open={open}
                title={initialValues ? `Detail Retur: ${initialValues.id}` : "Input Retur Penjualan"}
                onCancel={onCancel}
                width={800}
                maskClosable={false}
                footer={[
                    initialValues && <Button key="d" danger icon={<DeleteOutlined />} onClick={handleDelete} loading={isSaving}>Hapus & Revert</Button>,
                    <Button key="b" onClick={onCancel} disabled={isSaving}>Batal</Button>,
                    !initialValues && <Button key="s" type="primary" loading={isSaving} icon={<SaveOutlined />} onClick={() => form.submit()}>Simpan</Button>
                ]}
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
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
                                        <Select placeholder={isSearching ? "Mencari..." : "Pilih Invoice..."} disabled={!selectedCustomerName} onChange={handleInvoiceSelect} value={selectedInvoiceId}>
                                            {invoiceOptions.map(inv => (<Option key={inv.id} value={inv.id}>{inv.label}</Option>))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>
                        </div>
                    )}
                    <Row gutter={16}>
                        <Col span={12}><Form.Item name="tanggal" label="Tanggal Retur" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabled={!!initialValues}/></Form.Item></Col>
                        <Col span={12}><Form.Item name="keterangan" label="Keterangan"><Input disabled={!!initialValues}/></Form.Item></Col>
                    </Row>
                    <Divider orientation="left">Item Retur</Divider>
                    <div style={{ border: '1px solid #d9d9d9', borderRadius: 8, minHeight: 200, maxHeight: 350, overflowY: 'auto' }}>
                        {loadingItems ? <div style={{ padding: 40, textAlign: 'center' }}><Spin /></div> : sourceItems.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Pilih invoice dulu" style={{margin: '40px 0'}} /> : (
                            <List dataSource={sourceItems} renderItem={(item) => (
                                <ReturnItemRow key={item.id} item={item} isSelected={selectedItemIds.includes(item.id)} returnQty={returnQtys[item.id]} onToggle={handleToggleItem} onQtyChange={handleQtyChange} readOnly={!!initialValues} />
                            )} />
                        )}
                    </div>
                    <div style={{ marginTop: 16, textAlign: 'right', padding: 10, background: '#e6f7ff', borderRadius: 6 }}>
                        <div style={{ fontSize: 13, color: '#666' }}>Total Retur:</div>
                        <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff' }}>{initialValues ? formatRupiah(initialValues.totalRetur) : formatRupiah(grandTotalRetur)}</div>
                    </div>
                </Form>
            </Modal>
        </>
    );
};

export default ReturForm;               