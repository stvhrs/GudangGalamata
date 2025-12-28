import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
    Modal,
    Form, Input, InputNumber, Select, Button, DatePicker, message, Typography, Tag,
    Row, Col, Spin, Popconfirm
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { db } from '../../../api/firebase';
import {
    ref, update, serverTimestamp,
    query, orderByKey, startAt, endAt, get, orderByChild, equalTo
} from 'firebase/database';
import dayjs from 'dayjs';

import { useBukuStream, usePelangganStream } from '../../../hooks/useFirebaseData';

const { Text } = Typography;

const rupiahFormatter = (v) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(v || 0));

const SimpleSubtotal = ({ index }) => (
    <Form.Item noStyle shouldUpdate={(p, c) => 
        p.items?.[index]?.jumlah !== c.items?.[index]?.jumlah ||
        p.items?.[index]?.hargaSatuan !== c.items?.[index]?.hargaSatuan ||
        p.items?.[index]?.diskonPersen !== c.items?.[index]?.diskonPersen
    }>
        {({ getFieldValue }) => {
            const i = getFieldValue(['items', index]) || {};
            const bruto = (i.hargaSatuan || 0) * (i.jumlah || 0);
            const net = bruto - Math.round(bruto * (i.diskonPersen || 0) / 100);
            return <Input disabled value={rupiahFormatter(net)} style={{ textAlign: 'right', color: '#333', fontWeight: 'bold', backgroundColor: '#f5f5f5' }} />;
        }}
    </Form.Item>
);

export default function TransaksiJualForm({ open, onCancel, mode = 'create', initialTx = null, onSuccess }) {
    const { bukuList, loadingBuku } = useBukuStream();
    const { pelangganList, loadingPelanggan } = usePelangganStream();
    const loadingDependencies = loadingBuku || loadingPelanggan;
    const [form] = Form.useForm();
    const selectedDate = Form.useWatch('tanggal', form);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingEditData, setIsLoadingEditData] = useState(false);
    const [selectedPelanggan, setSelectedPelanggan] = useState(null);
    const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(mode === 'create');
    const [oldItemsForStock, setOldItemsForStock] = useState([]);

    const bukuOptions = useMemo(() => {
        return [...bukuList]
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
            .map((b) => {
                const stokAman = b.stok > 0;
                const searchString = `${b.nama} ${b.id} ${b.penerbit}`.toLowerCase();
                return {
                    value: b.id, title: b.nama, _data: b, _search: searchString,
                    label: (
                        <div style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                                <Text strong style={{ fontSize: 14, lineHeight: 1.2, flex: 1, whiteSpace: 'normal', marginRight: 8 }}>{b.nama}</Text>
                                <Text strong style={{ color: '#1677ff', whiteSpace: 'nowrap' }}>{rupiahFormatter(b.harga)}</Text>
                            </div>
                            <div style={{ marginBottom: 6 }}>
                                <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace', background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>Kode Buku: <strong style={{ color: '#595959' }}>{b.id}</strong></Text>
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                <Tag color="blue" style={{ margin: 0, fontSize: 10, lineHeight: '18px' }}>{b.penerbit || 'Umum'}</Tag>
                                <Tag color={stokAman ? 'success' : 'error'} style={{ margin: 0, fontSize: 10, lineHeight: '18px' }}>{stokAman ? `Stok: ${b.stok}` : 'Habis'}</Tag>
                            </div>
                        </div>
                    )
                };
            });
    }, [bukuList]);

    useEffect(() => {
        if (open && !loadingDependencies) {
            if (mode === 'edit' && initialTx) {
                const loadEditData = async () => {
                    setIsLoadingEditData(true);
                    try {
                        const p = pelangganList.find((x) => x.id === initialTx.customerId) || null;
                        setSelectedPelanggan(p);
                        form.setFieldsValue({
                            nomorInvoice: initialTx.id,
                            tanggal: initialTx.tanggal ? dayjs(initialTx.tanggal) : dayjs(),
                            customerId: initialTx.customerId,
                            keterangan: initialTx.keterangan === 'NULL' ? '' : (initialTx.keterangan || ''),
                            totalDiskon: initialTx.totalDiskon || 0,
                            biayaTentu: initialTx.totalBiayaLain || 0,
                        });
                        const itemsQuery = query(ref(db, 'invoice_items'), orderByChild('invoiceId'), equalTo(initialTx.id));
                        const snapshot = await get(itemsQuery);
                        let itemsToSet = [];
                        if (snapshot.exists()) {
                            const rawItems = snapshot.val();
                            itemsToSet = Object.values(rawItems).map(item => ({
                                idBuku: item.productId, jumlah: item.qty, hargaSatuan: item.harga, diskonPersen: item.diskonPersen || 0
                            }));
                        } else if (initialTx.items) {
                            itemsToSet = initialTx.items.map((it) => ({
                                idBuku: it.idBuku || it.productId, jumlah: it.jumlah || it.qty, hargaSatuan: it.hargaSatuan || it.harga, diskonPersen: it.diskonPersen || 0
                            }));
                        }
                        setOldItemsForStock(itemsToSet); 
                        form.setFieldsValue({ items: itemsToSet });
                    } catch (error) { console.error(error); message.error("Gagal memuat detail transaksi."); } 
                    finally { setIsLoadingEditData(false); }
                };
                loadEditData();
            } else if (mode === 'create') {
                form.resetFields();
                form.setFieldsValue({ tanggal: dayjs(), items: [{}], totalDiskon: 0, biayaTentu: 0 });
                setSelectedPelanggan(null);
                setOldItemsForStock([]);
                setIsGeneratingInvoice(true);
            }
        }
    }, [mode, initialTx, pelangganList, form, open, loadingDependencies]);

    useEffect(() => {
        if (mode !== 'create' || !open) return;
        let isMounted = true;
        const generateInvoiceNumber = async () => {
            try {
                const dateBasis = selectedDate ? dayjs(selectedDate) : dayjs();
                const dateFormat = dateBasis.format('YYMMDD'); 
                const keyPrefix = `INV-${dateFormat}-`;
                const qy = query(ref(db, 'invoices'), orderByKey(), startAt(keyPrefix), endAt(keyPrefix + '\uf8ff'));
                const snapshot = await get(qy);
                let nextNum = 1;
                if (snapshot.exists()) {
                    const data = snapshot.val();
                    const keys = Object.keys(data).sort(); 
                    const lastKey = keys[keys.length - 1]; 
                    const parts = lastKey.split('-');
                    const lastSeq = parts[parts.length - 1]; 
                    const num = parseInt(lastSeq, 10);
                    if (!isNaN(num)) nextNum = num + 1;
                }
                if (isMounted) form.setFieldsValue({ nomorInvoice: `${keyPrefix}${String(nextNum).padStart(3, '0')}` });
            } catch (e) { console.error("Error generate ID:", e); } 
            finally { if (isMounted) setIsGeneratingInvoice(false); }
        };
        generateInvoiceNumber();
        return () => { isMounted = false; };
    }, [mode, open, selectedDate, form]); 

    const handlePelangganChange = (id) => {
        const pel = pelangganList.find((p) => p.id === id) || null;
        setSelectedPelanggan(pel);
    };

    const handleBukuChange = useCallback((index, idBuku) => {
        const selectedOption = bukuOptions.find(opt => opt.value === idBuku);
        const bukuData = selectedOption?._data;
        if (bukuData) {
            const items = form.getFieldValue('items') || [];
            items[index] = { ...items[index], idBuku, hargaSatuan: Number(bukuData.harga || 0), diskonPersen: Number(bukuData.diskon || 0), jumlah: items[index]?.jumlah || 1 };
            form.setFieldsValue({ items: [...items] });
            calculateTotalDiskon(items);
        }
    }, [bukuOptions, form]);

    const calculateTotalDiskon = (items) => {
        if (!items || !Array.isArray(items)) return;
        let sumDisc = 0;
        items.forEach(i => {
            if(!i) return;
            sumDisc += Math.round((Number(i.hargaSatuan || 0) * Number(i.jumlah || 0)) * Number(i.diskonPersen || 0) / 100);
        });
        form.setFieldsValue({ totalDiskon: sumDisc });
    };

    const onFormValuesChange = (changedValues, allValues) => {
        if (changedValues.items) calculateTotalDiskon(allValues.items);
    };

    const handleFinish = async (values) => {
        setIsSaving(true);
        message.loading({ content: 'Menyimpan...', key: 'tx', duration: 0 });
        try {
            const { customerId, items, totalDiskon, biayaTentu, nomorInvoice, tanggal, keterangan } = values;
            if (!items?.length || items.some(i => !i?.idBuku)) throw new Error('Minimal 1 item buku valid.');
            const pelanggan = pelangganList.find((p) => p.id === customerId);
            if (!pelanggan) throw new Error('Customer tidak valid.');

            let totalBruto = 0;
            let totalQty = 0;
            const processedItems = items.map((item) => {
                const option = bukuOptions.find(b => b.value === item.idBuku);
                if (!option) throw new Error(`Buku tidak ditemukan`);
                const buku = option._data;
                const hargaSatuan = Number(item.hargaSatuan);
                const diskonPersen = Number(item.diskonPersen || 0);
                const jumlah = Number(item.jumlah);
                const brutoItem = hargaSatuan * jumlah;
                const diskonItem = Math.round(brutoItem * (diskonPersen / 100));
                const subtotal = brutoItem - diskonItem;
                totalBruto += brutoItem;
                totalQty += jumlah;
                return { idBuku: item.idBuku, judul: buku.nama, jumlah, hargaSatuan, diskonPersen, subtotal, _bukuData: buku };
            });

            const totalNetto = (totalBruto - Number(totalDiskon || 0)) + Number(biayaTentu || 0);
            const txKey = nomorInvoice;
            const updates = {};
            let statusPembayaran = 'BELUM';
            let existingBayar = 0;

            if (mode === 'create') {
                statusPembayaran = 'BELUM';
                existingBayar = 0;
            } else {
                existingBayar = Number(initialTx.totalBayar || 0);
                if (existingBayar >= totalNetto) statusPembayaran = 'LUNAS';
                else if (existingBayar > 0) statusPembayaran = 'BELUM';
            }

            const compositeStatus = `${pelanggan.nama}_${statusPembayaran}`;
            const headerData = {
                id: nomorInvoice,
                tanggal: tanggal.valueOf(),
                customerId,
                namaCustomer: pelanggan.nama,
                keterangan: keterangan || 'NULL',
                totalBruto,
                totalDiskon: Number(totalDiskon || 0),
                totalBiayaLain: Number(biayaTentu || 0),
                totalNetto,
                totalQty,
                totalBayar: existingBayar,
                statusPembayaran: statusPembayaran,
                compositeStatus: compositeStatus,
                totalRetur: mode === 'edit' ? (initialTx.totalRetur || 0) : 0,
                updatedAt: serverTimestamp()
            };

            if (mode === 'create') {
                updates[`invoices/${txKey}`] = { ...headerData, createdAt: serverTimestamp() };
            } else {
                updates[`invoices/${txKey}`] = { ...initialTx, ...headerData };
            }

            // 🔥 UPDATE CUSTOMER TIMESTAMP
            if (customerId) {
                updates[`customers/${customerId}/updatedAt`] = serverTimestamp();
            }

            if (mode === 'edit') {
                const newIds = processedItems.map(i => i.idBuku);
                oldItemsForStock.forEach(old => {
                    if (!newIds.includes(old.idBuku)) updates[`invoice_items/ITEM_${txKey}_${old.idBuku}`] = null;
                });
            }

            processedItems.forEach(i => {
                const itemId = `ITEM_${txKey}_${i.idBuku}`;
                updates[`invoice_items/${itemId}`] = {
                    id: itemId, invoiceId: txKey, productId: i.idBuku, judul: i.judul,
                    qty: i.jumlah, harga: i.hargaSatuan, diskonPersen: i.diskonPersen, subtotal: i.subtotal,
                    createdAt: mode === 'create' ? serverTimestamp() : null, updatedAt: serverTimestamp()
                };
            });

            const stockDiff = new Map();
            if (mode === 'edit') {
                oldItemsForStock.forEach(i => {
                    const currentVal = stockDiff.get(i.idBuku) || 0;
                    stockDiff.set(i.idBuku, currentVal + Number(i.jumlah));
                });
            }
            processedItems.forEach(i => {
                const currentVal = stockDiff.get(i.idBuku) || 0;
                stockDiff.set(i.idBuku, currentVal - Number(i.jumlah));
            });

            const timestampNow = Date.now();
            let histCounter = 0;
            for (const [productId, change] of stockDiff.entries()) {
                if (change === 0) continue;
                const buku = bukuList.find(b => b.id === productId);
                if (buku) {
                    const stokAwal = Number(buku.stok || 0);
                    const stokAkhir = stokAwal + change;
                    updates[`products/${productId}/stok`] = stokAkhir;
                    updates[`products/${productId}/updatedAt`] = serverTimestamp();
                    const histId = `HIST_${txKey}_${productId}_${timestampNow + histCounter}`;
                    histCounter++;
                    updates[`stock_history/${histId}`] = {
                        id: histId, bukuId: productId, judul: buku.nama, nama: "ADMIN",
                        keterangan: mode === 'create' ? `Penjualan Ref: ${txKey}` : `Edit Ref: ${txKey}`,
                        perubahan: change, stokAwal: stokAwal, stokAkhir: stokAkhir, refId: txKey,
                        tanggal: timestampNow, createdAt: timestampNow, updatedAt: timestampNow
                    };
                }
            }

            await update(ref(db), updates);
            message.success({ content: 'Tersimpan!', key: 'tx' });
            form.resetFields();
            onSuccess?.();
        } catch (error) {
            console.error(error);
            message.error({ content: error.message, key: 'tx' });
        } finally { setIsSaving(false); }
    };

    const handleDelete = async () => {
        if (mode !== 'edit' || !initialTx?.id) return;
        setIsSaving(true);
        message.loading({ content: 'Menghapus...', key: 'del', duration: 0 });
        try {
            const txKey = initialTx.id;
            const updates = {};
            updates[`invoices/${txKey}`] = null;
            const timestampNow = Date.now();
            let histCounter = 0;

            for (const item of oldItemsForStock) {
                const buku = bukuList.find(b => b.id === item.idBuku);
                const itemId = `ITEM_${txKey}_${item.idBuku}`;
                updates[`invoice_items/${itemId}`] = null;
                if (buku) {
                    const perubahanStok = Number(item.jumlah);
                    const stokAwal = Number(buku.stok || 0);
                    const stokAkhir = stokAwal + perubahanStok;
                    updates[`products/${item.idBuku}/stok`] = stokAkhir;
                    updates[`products/${item.idBuku}/updatedAt`] = serverTimestamp();
                    const histId = `HIST_${txKey}_${item.idBuku}_${timestampNow + histCounter}`;
                    histCounter++;
                    updates[`stock_history/${histId}`] = {
                        id: histId, bukuId: item.idBuku, judul: buku.nama, nama: "ADMIN",
                        keterangan: `Hapus Ref: ${txKey}`, perubahan: perubahanStok,
                        stokAwal: stokAwal, stokAkhir: stokAkhir, refId: txKey,
                        tanggal: timestampNow, createdAt: timestampNow, updatedAt: timestampNow
                    };
                }
            }
            await update(ref(db), updates);
            message.success({ content: 'Dihapus!', key: 'del' });
            onSuccess?.();
        } catch (e) { message.error({ content: e.message, key: 'del' }); } 
        finally { setIsSaving(false); }
    };

    return (
        <Modal
            style={{ top: 20 }}
            title={mode === 'create' ? 'Transaksi Baru' : 'Edit Transaksi'}
            open={open} onCancel={onCancel}
            width={1000} confirmLoading={isSaving}
            destroyOnClose footer={null} maskClosable={false}
        >
             {/* ... (Isi UI Form Transaksi Jual, sama seperti sebelumnya) ... */}
            <Spin spinning={loadingDependencies || isLoadingEditData}>
                <Form form={form} layout="vertical" onFinish={handleFinish} onValuesChange={onFormValuesChange}>
                    <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: 8, marginBottom: 16 }}>
                        <Row gutter={12}>
                            <Col xs={12} sm={8}><Form.Item name="nomorInvoice" label="No. Invoice" rules={[{ required: true }]}><Input disabled style={{ fontWeight: 'bold' }} placeholder="Auto..." /></Form.Item></Col>
                            <Col xs={12} sm={8}><Form.Item name="tanggal" label="Tanggal" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" /></Form.Item></Col>
                            <Col xs={24} sm={8}>
                                <Form.Item name="customerId" label="Customer" rules={[{ required: true }]}>
                                    <Select showSearch placeholder="Pilih Customer" optionFilterProp="children" filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())} disabled={isGeneratingInvoice && mode === 'create'} options={pelangganList.map(p => ({ label: p.nama, value: p.id }))} onChange={handlePelangganChange} />
                                </Form.Item>
                            </Col>
                            <Col xs={24}><Form.Item name="keterangan" label="Catatan" style={{ marginBottom: 0 }}><Input placeholder="Keterangan tambahan..." /></Form.Item></Col>
                        </Row>
                    </div>

                    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 8, padding: 4 }}>
                        <div style={{ padding: '8px 12px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Item Buku</span><span style={{ fontSize: 12, color: '#888' }}>Total {form.getFieldValue('items')?.length || 0} item</span>
                        </div>
                        <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '8px' }}>
                            <Form.List name="items">
                                {(fields, { add, remove }) => (
                                    <>
                                        {fields.map(({ key, name, ...restField }, index) => (
                                            <Row key={key} gutter={8} align="middle" style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px dashed #eee' }}>
                                                <Col xs={24} md={10}>
                                                    <Form.Item {...restField} name={[name, 'idBuku']} style={{ marginBottom: 4 }} rules={[{ required: true, message: 'Pilih buku' }]}>
                                                        <Select showSearch placeholder={`Cari Nama / Kode Buku...`} onChange={(val) => handleBukuChange(index, val)} style={{ width: '100%' }} options={bukuOptions.map(opt => ({ value: opt.value, label: opt.label, title: opt.title }))} optionLabelProp="title" filterOption={(input, option) => { const originalOption = bukuOptions.find(o => o.value === option.value); if (!originalOption) return false; return originalOption._search.includes(input.toLowerCase()); }} listHeight={300} virtual={true} />
                                                    </Form.Item>
                                                </Col>
                                                <Col xs={6} md={3}><Form.Item {...restField} name={[name, 'jumlah']} style={{ marginBottom: 4 }}><InputNumber min={1} placeholder="Qty" style={{ width: '100%' }} /></Form.Item></Col>
                                                <Col xs={10} md={4}><Form.Item {...restField} name={[name, 'hargaSatuan']} style={{ marginBottom: 4 }}><InputNumber formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={(v) => v.replace(/\$\s?|(,*)/g, '')} style={{ width: '100%' }} placeholder="Harga" /></Form.Item></Col>
                                                <Col xs={8} md={2}><Form.Item {...restField} name={[name, 'diskonPersen']} style={{ marginBottom: 4 }}><InputNumber min={0} max={100} formatter={v => `${v}%`} parser={v => v.replace('%', '')} style={{ width: '100%' }} /></Form.Item></Col>
                                                <Col xs={12} md={4}><SimpleSubtotal index={index} /></Col>
                                                <Col xs={2} md={1} style={{ textAlign: 'center' }}><Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} /></Col>
                                            </Row>
                                        ))}
                                        <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} style={{ marginTop: 8 }}>Tambah Item</Button>
                                    </>
                                )}
                            </Form.List>
                        </div>
                    </div>

                    <div style={{ marginTop: 16, background: '#f0f9ff', padding: 16, borderRadius: 8, border: '1px solid #bae7ff' }}>
                        <Row gutter={16}>
                            <Col xs={24} md={12}>
                                <Form.Item name="totalDiskon" label="Total Diskon (Rp) - Auto/Manual"><InputNumber style={{ width: '100%' }} formatter={v => `Rp ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v.replace(/Rp\s?|(,*)/g, '')} placeholder="Otomatis terhitung" /></Form.Item>
                                <Form.Item name="biayaTentu" label="Biaya Lain (Rp)"><InputNumber style={{ width: '100%' }} formatter={v => `Rp ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={v => v.replace(/Rp\s?|(,*)/g, '')} /></Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item noStyle shouldUpdate>
                                    {({ getFieldValue }) => {
                                        const items = getFieldValue('items') || [];
                                        const disc = getFieldValue('totalDiskon') || 0;
                                        const cost = getFieldValue('biayaTentu') || 0;
                                        const bruto = items.reduce((acc, i) => acc + ((i?.hargaSatuan||0) * (i?.jumlah||0)), 0);
                                        const netto = (bruto - disc) + cost;
                                        return (
                                            <div style={{ textAlign: 'right' }}>
                                                <Text type="secondary">Total Bruto</Text><div style={{ fontSize: 16, marginBottom: 8 }}>{rupiahFormatter(bruto)}</div>
                                                <Text type="secondary">Grand Total (Netto)</Text><div style={{ fontSize: 28, fontWeight: 'bold', color: '#3f8600' }}>{rupiahFormatter(netto)}</div>
                                            </div>
                                        );
                                    }}
                                </Form.Item>
                            </Col>
                        </Row>
                    </div>

                    <Row justify="end" style={{ marginTop: 24, gap: 8 }}>
                        {mode === 'edit' && (<Popconfirm title="Hapus transaksi ini? Stok akan dikembalikan." onConfirm={handleDelete} okButtonProps={{ danger: true }}><Button danger loading={isSaving}>Hapus</Button></Popconfirm>)}
                        <Button onClick={onCancel}>Batal</Button>
                        <Button type="primary" htmlType="submit" loading={isSaving} size="large">Simpan Transaksi</Button>
                    </Row>
                </Form>
            </Spin>
        </Modal>
    );
}