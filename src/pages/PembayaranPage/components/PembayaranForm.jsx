import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Modal, Form, Input, InputNumber, DatePicker, Button,
    Typography, message, List, Checkbox, Row, Col, Empty, Tag, Spin, Divider, Select
} from 'antd';
import { 
    DeleteOutlined, SaveOutlined, PlusOutlined, 
    UnorderedListOutlined, SearchOutlined, FilePdfOutlined 
} from '@ant-design/icons';
import dayjs from 'dayjs';

// --- LIBRARY UNTUK PDF ---
import jsPDF from 'jspdf';

// Sesuaikan path import ini dengan struktur project Anda
import { usePelangganStream } from '../../../hooks/useFirebaseData';
import { db } from '../../../api/firebase'; 
import {
    ref, update, get, query, orderByChild, orderByKey,
    startAt, endAt, equalTo
} from "firebase/database";

const { Text } = Typography;
const { Option } = Select;

const SOURCE_DEFAULT = 'INVOICE_PAYMENT'; 
const ARAH_TRANSAKSI = 'IN';

// --- HELPER FUNCTIONS ---
const currencyFormatter = (value) =>
    new Intl.NumberFormat('id-ID', { 
        style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 
    }).format(value);

const generateAllocationId = (paymentId, invoiceId) => `ALLOC_${paymentId}_${invoiceId}`;

// --- COMPONENT LIST ITEM ---
const InvoiceListItem = React.memo(({ item, isSelected, allocation, onToggle, onNominalChange, readOnly }) => {
    return (
        <List.Item 
            style={{ 
                padding: '12px 16px',
                background: isSelected ? '#e6f7ff' : '#fff', 
                borderBottom: '1px solid #f0f0f0', 
                transition: 'all 0.3s'
            }}
            actions={!readOnly ? [<Checkbox checked={isSelected} onChange={(e) => onToggle(item.id, e.target.checked)} />] : []}
        >
            <div style={{ width: '100%', marginRight: 16 }}>
                <Row align="middle" gutter={8}>
                    <Col flex="auto">
                        <div style={{ fontWeight: 'bold', fontSize: 15, color: 'rgba(0, 0, 0, 0.88)' }}>
                            {item.namaCustomer}
                        </div>
                        <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
                            {item.id} • {dayjs(item.tanggal).format('DD MMM YY')}
                        </div>
                        <div style={{ fontSize: 13, marginTop: 4, background: '#fafafa', padding: 8, borderRadius: 6, border: '1px solid #f0f0f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{color: '#555'}}>Netto:</span>
                                <span style={{fontWeight: 500}}>{currencyFormatter(item.totalNetto)}</span>
                            </div>
                             <div style={{ display: 'flex', justifyContent: 'space-between', color: '#096dd9', marginBottom: 4 }}>
                                <span>Sudah Bayar:</span>
                                <span>-{currencyFormatter(item.sudahBayar)}</span>
                            </div>
                            <div style={{ borderTop: '1px dashed #ccc', margin: '4px 0', padding: 0 }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 13 }}>
                                <span>Sisa Tagihan:</span>
                                <span style={{ color: item.sisaTagihan > 1 ? '#fa541c' : '#389e0d', fontSize: 14 }}>
                                    {currencyFormatter(item.sisaTagihan)}
                                </span>
                            </div>
                        </div>
                    </Col>
                    <Col>
                        {readOnly ? (
                            <div style={{textAlign: 'right'}}>
                                <div style={{fontSize: 11, color: '#666'}}>Bayar di sini:</div>
                                <Text strong style={{color: '#1890ff', fontSize: 15}}>{currencyFormatter(allocation)}</Text>
                            </div>
                        ) : (
                            isSelected ? (
                                <InputNumber
                                    value={allocation}
                                    onChange={(v) => onNominalChange(v, item.id)}
                                    style={{ width: 140, fontSize: 14, fontWeight: 'bold' }}
                                    placeholder="Nominal"
                                    min={0} max={item.sisaTagihan}
                                    decimalSeparator="," step={1}
                                    formatter={value => !value && value !== 0 ? '' : `Rp ${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`}
                                    parser={value => value ? value.replace(/Rp\s?|(\.*)/g, '') : ''}
                                />
                            ) : <Tag color="red" style={{ fontSize: 11, padding: '2px 8px' }}>BELUM</Tag>
                        )}
                    </Col>
                </Row>
            </div>
        </List.Item>
    );
});

// --- MAIN COMPONENT ---
const PembayaranForm = ({ open, onCancel, initialValues }) => {
    const [form] = Form.useForm();
    const [modal, contextHolder] = Modal.useModal();
    const selectedDate = Form.useWatch('tanggal', form);
    const { pelangganList: rawPelangganData, loadingPelanggan } = usePelangganStream();
    
    const pelangganList = useMemo(() => {
        if (!rawPelangganData) return [];
        let processed = Array.isArray(rawPelangganData) ? rawPelangganData : Object.keys(rawPelangganData).map(key => ({ id: key, ...rawPelangganData[key] }));
        return processed.map(p => ({ ...p, displayName: p.nama || p.name || p.namaPelanggan || `(ID:${p.id})` }));
    }, [rawPelangganData]);

    const [selectedCustomerName, setSelectedCustomerName] = useState(null);
    const [invoiceList, setInvoiceList] = useState([]); 
    const [historyList, setHistoryList] = useState([]); 
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
    const [paymentAllocations, setPaymentAllocations] = useState({});
    const [isSearching, setIsSearching] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isGeneratingId, setIsGeneratingId] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [totalInputAmount, setTotalInputAmount] = useState(0);

    const [allCustomerBalances, setAllCustomerBalances] = useState([]);
    const [showSummary, setShowSummary] = useState(false);
    const [loadingSummary, setLoadingSummary] = useState(false);

    const maxPayableAmount = useMemo(() => invoiceList.reduce((sum, item) => sum + (Number(item.sisaTagihan) || 0), 0), [invoiceList]);

    useEffect(() => {
        if (!open) resetFormState();
        else if (initialValues) {
            form.setFieldsValue({ id: initialValues.id, tanggal: dayjs(initialValues.tanggal), keterangan: initialValues.keterangan });
            setTotalInputAmount(initialValues.totalBayar);
            setSelectedCustomerName(initialValues.namaCustomer);
            fetchPaymentHistory(initialValues.id);
        } else {
            form.resetFields();
            form.setFieldsValue({ tanggal: dayjs(), keterangan: '' });
        }
    }, [initialValues, open, form]);

    const resetFormState = () => {
        form.resetFields(); setSelectedInvoiceIds([]); setInvoiceList([]); setHistoryList([]);
        setPaymentAllocations({}); setSelectedCustomerName(null); setTotalInputAmount(0); 
        setIsSearching(false); setShowSummary(false); setAllCustomerBalances([]);
    };

    const handleDownloadPDF = () => {
        if (allCustomerBalances.length === 0) return message.warning("Data kosong!");
        const doc = new jsPDF();
        const totalAll = allCustomerBalances.reduce((acc, curr) => acc + curr.totalDebt, 0);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text("LAPORAN REKAP PIUTANG CUSTOMER", 105, 15, { align: 'center' });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Dicetak pada: ${dayjs().format('DD MMMM YYYY HH:mm')}`, 105, 22, { align: 'center' });

        let yPos = 35;
        const marginX = 14;
        const rowHeight = 8;
        const colNo = 15;
        const colNama = 80;
        const colFaktur = 35;

        doc.setFont("helvetica", "bold");
        doc.setFillColor(230, 230, 230);
        doc.rect(marginX, yPos - 5, 180, rowHeight, 'F'); 
        doc.text("No", marginX + 2, yPos);
        doc.text("Nama Customer", marginX + colNo + 2, yPos);
        doc.text("Jml Faktur", marginX + colNo + colNama + 2, yPos);
        doc.text("Total Sisa Tagihan", marginX + colNo + colNama + colFaktur + 2, yPos);
        doc.line(marginX, yPos + 2, marginX + 180, yPos + 2); 
        yPos += rowHeight;

        doc.setFont("helvetica", "normal");
        allCustomerBalances.forEach((item, index) => {
            if (yPos > 280) { doc.addPage(); yPos = 20; }
            doc.text(String(index + 1), marginX + 2, yPos);
            doc.text(item.name.substring(0, 40), marginX + colNo + 2, yPos);
            doc.text(String(item.count), marginX + colNo + colNama + 2, yPos);
            doc.text(currencyFormatter(item.totalDebt), marginX + colNo + colNama + colFaktur + 2, yPos);
            doc.setDrawColor(240, 240, 240);
            doc.line(marginX, yPos + 2, marginX + 180, yPos + 2);
            yPos += rowHeight;
        });

        doc.setFont("helvetica", "bold");
        doc.setFillColor(245, 245, 245);
        doc.rect(marginX, yPos - 5, 180, rowHeight, 'F');
        doc.text("GRAND TOTAL", marginX + colNo + 2, yPos);
        doc.text(currencyFormatter(totalAll), marginX + colNo + colNama + colFaktur + 2, yPos);
        doc.save(`Rekap_Piutang_${dayjs().format('YYYYMMDD_HHmm')}.pdf`);
    };

    const fetchAllCustomerBalances = async () => {
        setLoadingSummary(true);
        try {
            const snap = await get(ref(db, 'invoices'));
            if (snap.exists()) {
                const grouped = {};
                snap.forEach((child) => {
                    const inv = child.val();
                    const sisa = Number(inv.sisaTagihan) || 0;
                    if (sisa > 0.1) {
                        const name = inv.namaCustomer || 'Tanpa Nama';
                        if (!grouped[name]) grouped[name] = { name: name, totalDebt: 0, count: 0 };
                        grouped[name].totalDebt += sisa;
                        grouped[name].count += 1;
                    }
                });
                setAllCustomerBalances(Object.values(grouped).sort((a, b) => b.totalDebt - a.totalDebt));
                setShowSummary(true);
            }
        } finally { setLoadingSummary(false); }
    };

    const fetchPaymentHistory = async (paymentId) => {
        setIsLoadingHistory(true);
        try {
            const allocSnap = await get(query(ref(db, 'payment_allocations'), orderByChild('paymentId'), equalTo(paymentId)));
            if (allocSnap.exists()) {
                const promises = Object.values(allocSnap.val()).map(async (alloc) => {
                    const invSnap = await get(ref(db, `invoices/${alloc.invoiceId}`));
                    const inv = invSnap.exists() ? invSnap.val() : {};
                    return {
                        id: alloc.invoiceId, namaCustomer: inv.namaCustomer || 'Unknown', tanggal: inv.tanggal || 0,
                        totalNetto: Number(inv.totalNetto) || 0,
                        sudahBayar: Number(inv.totalBayar) || 0,
                        sisaTagihan: Number(inv.sisaTagihan) || 0,
                        amountAllocated: alloc.amount
                    };
                });
                setHistoryList(await Promise.all(promises));
            }
        } finally { setIsLoadingHistory(false); }
    };

    useEffect(() => {
        if (initialValues || !open) return;
        setIsGeneratingId(true);
        const generateId = async () => {
            const dateBasis = selectedDate ? dayjs(selectedDate) : dayjs();
            const keyPrefix = `PY-${dateBasis.format('YYMMDD')}-`;
            const snapshot = await get(query(ref(db, 'payments'), orderByKey(), startAt(keyPrefix), endAt(keyPrefix + '\uf8ff')));
            let nextNum = 1;
            if (snapshot.exists()) {
                const keys = Object.keys(snapshot.val()).sort();
                const lastKey = keys[keys.length - 1];
                const parts = lastKey.split('-');
                const num = parseInt(parts[parts.length - 1], 10);
                if (!isNaN(num)) nextNum = num + 1;
            }
            form.setFieldsValue({ id: `${keyPrefix}${String(nextNum).padStart(3, '0')}` });
            setIsGeneratingId(false);
        };
        generateId();
    }, [initialValues, open, selectedDate, form]);

    const handleCustomerSelect = async (namaPelanggan) => {
        if (!namaPelanggan) return;
        setSelectedCustomerName(namaPelanggan);
        setIsSearching(true);
        setShowSummary(false); 
        try {
            const snap = await get(query(ref(db, 'invoices'), orderByChild('namaCustomer'), equalTo(namaPelanggan)));
            let results = [];
            if (snap.exists()) {
                snap.forEach((child) => {
                    const val = child.val();
                    const sisa = Number(val.sisaTagihan) || 0;
                    if (sisa > 0.01) results.push({ id: child.key, ...val, sudahBayar: Number(val.totalBayar) || 0 });
                });
            }
            setInvoiceList(results.sort((a, b) => a.tanggal - b.tanggal));
        } finally { setIsSearching(false); }
    };

    const distributeAmount = useCallback((amount) => {
        let remaining = amount; let newAlloc = {}; let newIds = [];
        for (const inv of invoiceList) {
            if (remaining <= 0) break;
            const amt = Math.min(remaining, inv.sisaTagihan);
            remaining -= amt; newAlloc[inv.id] = amt; newIds.push(inv.id);
        }
        setPaymentAllocations(newAlloc); setSelectedInvoiceIds(newIds);
    }, [invoiceList]);

    const handleTotalBayarChange = (val) => {
        const amt = Math.min(val || 0, maxPayableAmount);
        setTotalInputAmount(amt); distributeAmount(amt);
    };

    const handleNominalChange = (val, invId) => {
        const value = val || 0;
        setPaymentAllocations(prev => {
            const next = { ...prev };
            if (value <= 0) { delete next[invId]; setSelectedInvoiceIds(ids => ids.filter(i => i !== invId)); }
            else next[invId] = value;
            setTotalInputAmount(Object.values(next).reduce((a, b) => a + b, 0));
            return next;
        });
    };

    const handleToggle = (id, checked) => {
        if (checked) {
            const inv = invoiceList.find(i => i.id === id);
            setPaymentAllocations(p => ({ ...p, [id]: inv.sisaTagihan }));
            setSelectedInvoiceIds(p => [...p, id]);
            setTotalInputAmount(prev => prev + inv.sisaTagihan);
        } else {
            setTotalInputAmount(prev => prev - (paymentAllocations[id] || 0));
            setPaymentAllocations(p => { const n = { ...p }; delete n[id]; return n; });
            setSelectedInvoiceIds(p => p.filter(i => i !== id));
        }
    };

    // --- FUNGSI SAVE ---
    const handleSave = async (values) => {
        if (selectedInvoiceIds.length === 0 || totalInputAmount <= 0) return message.error("Masukkan nominal.");
        setIsSaving(true);
        try {
            const timestamp = Date.now();
            const paymentId = values.id;
            const customerData = pelangganList.find(p => p.displayName === selectedCustomerName);
            const customerId = customerData?.id || 'UNKNOWN';

            const updates = {};
            updates[`payments/${paymentId}`] = { 
                id: paymentId, arah: ARAH_TRANSAKSI, sumber: SOURCE_DEFAULT, 
                tanggal: dayjs(values.tanggal).valueOf(), totalBayar: totalInputAmount, 
                customerId, namaCustomer: selectedCustomerName, 
                keterangan: values.keterangan || '-', createdAt: timestamp, updatedAt: timestamp 
            };

            if (customerId !== 'UNKNOWN') {
                const cSnap = await get(ref(db, `customers/${customerId}`));
                updates[`customers/${customerId}/saldoAkhir`] = (cSnap.exists() ? Number(cSnap.val().saldoAkhir) || 0 : 0) + totalInputAmount;
                updates[`customers/${customerId}/updatedAt`] = timestamp;
            }

            selectedInvoiceIds.forEach(id => {
                const inv = invoiceList.find(i => i.id === id);
                const amt = Number(paymentAllocations[id]);
                const newBayar = (Number(inv.totalBayar) || 0) + amt;
                const newSisa = (Number(inv.sisaTagihan) || 0) - amt;
                const status = newSisa <= 1 ? 'LUNAS' : 'BELUM';
                updates[`payment_allocations/${generateAllocationId(paymentId, id)}`] = { id: generateAllocationId(paymentId, id), paymentId, invoiceId: id, amount: amt, createdAt: timestamp, updatedAt: timestamp };
                updates[`invoices/${id}/totalBayar`] = newBayar;
                updates[`invoices/${id}/sisaTagihan`] = newSisa;
                updates[`invoices/${id}/statusPembayaran`] = status;
                updates[`invoices/${id}/compositeStatus`] = `${selectedCustomerName.toUpperCase()}_${status}`;
                updates[`invoices/${id}/updatedAt`] = timestamp;
            });

            await update(ref(db), updates);
            message.success('Tersimpan!'); onCancel();
        } finally { setIsSaving(false); }
    };

    // --- FUNGSI DELETE (ROLLBACK DATA) ---
    const handleDelete = async () => {
        modal.confirm({
            title: 'Hapus Pembayaran',
            content: 'Apakah Anda yakin? Sisa tagihan invoice akan dikembalikan dan saldo customer dikurangi.',
            okText: 'Ya, Hapus',
            okType: 'danger',
            cancelText: 'Batal',
            onOk: async () => {
                setIsSaving(true);
                try {
                    const paymentId = initialValues.id;
                    const customerId = initialValues.customerId;
                    const totalBayar = initialValues.totalBayar;
                    const updates = {};

                    // 1. Rollback Saldo Customer
                    if (customerId && customerId !== 'UNKNOWN') {
                        const cSnap = await get(ref(db, `customers/${customerId}`));
                        if (cSnap.exists()) {
                            updates[`customers/${customerId}/saldoAkhir`] = (Number(cSnap.val().saldoAkhir) || 0) - totalBayar;
                        }
                    }

                    // 2. Rollback Invoices & Hapus Alokasi
                    for (const item of historyList) {
                        const invSnap = await get(ref(db, `invoices/${item.id}`));
                        if (invSnap.exists()) {
                            const currentInv = invSnap.val();
                            const restoredSisa = (Number(currentInv.sisaTagihan) || 0) + item.amountAllocated;
                            const restoredBayar = (Number(currentInv.totalBayar) || 0) - item.amountAllocated;
                            
                            updates[`invoices/${item.id}/totalBayar`] = restoredBayar;
                            updates[`invoices/${item.id}/sisaTagihan`] = restoredSisa;
                            updates[`invoices/${item.id}/statusPembayaran`] = restoredSisa <= 1 ? 'LUNAS' : 'BELUM';
                            updates[`invoices/${item.id}/compositeStatus`] = `${initialValues.namaCustomer.toUpperCase()}_${restoredSisa <= 1 ? 'LUNAS' : 'BELUM'}`;
                        }
                        updates[`payment_allocations/${generateAllocationId(paymentId, item.id)}`] = null;
                    }

                    // 3. Hapus Data Pembayaran Utama
                    updates[`payments/${paymentId}`] = null;

                    await update(ref(db), updates);
                    message.success('Pembayaran berhasil dihapus.');
                    onCancel();
                } catch (e) { message.error('Gagal menghapus.'); }
                finally { setIsSaving(false); }
            }
        });
    };

    return (
        <>
            {contextHolder}
            <Modal
                style={{ top: 20 }} open={open} onCancel={onCancel} width={800}
                title={initialValues ? "Detail Pembayaran" : "Input Pembayaran Customer"}
                footer={[
                    initialValues && <Button key="delete" danger icon={<DeleteOutlined />} onClick={handleDelete} loading={isSaving}>Hapus</Button>,
                    <Button key="back" onClick={onCancel}>Batal</Button>,
                    !initialValues && <Button key="submit" type="primary" loading={isSaving} icon={<SaveOutlined />} onClick={() => form.submit()}>Simpan Pembayaran</Button>
                ]}
            >
                 <Spin spinning={isGeneratingId || loadingSummary}>
                    <Form form={form} layout="vertical" onFinish={handleSave}>
                        <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: 8, marginBottom: 16 }}>
                            <Row gutter={12}>
                                <Col span={12}><Form.Item name="id" label="No. Pembayaran"><Input disabled style={{ fontWeight: 'bold' }} /></Form.Item></Col>
                                <Col span={12}><Form.Item name="tanggal" label="Tanggal" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabled={!!initialValues} /></Form.Item></Col>
                            </Row>
                        </div>

                        {!initialValues && (
                            <>
                                <div style={{ marginBottom: 16 }}>
                                    <Row gutter={8}>
                                        <Col flex="auto">
                                            <Button block type="dashed" icon={<UnorderedListOutlined />} onClick={() => showSummary ? setShowSummary(false) : fetchAllCustomerBalances()}>
                                                {showSummary ? "Tutup Rekap" : "Load Rekap Semua Tagihan"}
                                            </Button>
                                        </Col>
                                        {showSummary && (
                                            <Col><Button type="primary" icon={<FilePdfOutlined />} onClick={handleDownloadPDF}>Download PDF</Button></Col>
                                        )}
                                    </Row>
                                    {showSummary && (
                                        <div style={{ marginTop: 8, maxHeight: 250, overflowY: 'auto', border: '1px solid #d9d9d9', borderRadius: 8, background: '#fff' }}>
                                            <List size="small" dataSource={allCustomerBalances} renderItem={item => (
                                                <List.Item actions={[<Button type="link" size="small" icon={<SearchOutlined />} onClick={() => handleCustomerSelect(item.name)}>Pilih</Button>]}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', paddingRight: 10 }}>
                                                        <Text strong>{item.name} <Tag color="orange" style={{fontSize: 10}}>{item.count} Faktur</Tag></Text>
                                                        <Text type="danger" strong>{currencyFormatter(item.totalDebt)}</Text>
                                                    </div>
                                                </List.Item>
                                            )} />
                                        </div>
                                    )}
                                </div>

                                <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                                    <Row gutter={16}>
                                        <Col span={12}>
                                            <Form.Item label="Pilih Customer" required>
                                                <Select showSearch placeholder="Pilih..." loading={loadingPelanggan} onChange={handleCustomerSelect} value={selectedCustomerName} style={{ width: '100%' }} filterOption={(input, option) => (option?.children ?? '').toLowerCase().includes(input.toLowerCase())}>
                                                    {pelangganList.map(p => (<Option key={p.id} value={p.displayName}>{p.displayName}</Option>))}
                                                </Select>
                                            </Form.Item>
                                            {invoiceList.length > 0 && <Tag color="blue">Sisa: {currencyFormatter(maxPayableAmount)}</Tag>}
                                        </Col>
                                        <Col span={12}>
                                            <Form.Item label="Total Uang Diterima" required>
                                                <InputNumber style={{ width: '100%', fontWeight: 'bold', fontSize: 16 }} value={totalInputAmount} onChange={handleTotalBayarChange} disabled={invoiceList.length === 0} formatter={value => !value && value !== 0 ? 'Rp 0' : `Rp ${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`} parser={value => value ? value.replace(/Rp\s?|(\.*)/g, '') : ''} />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                </div>
                            </>
                        )}

                        <Divider dashed style={{margin: '12px 0'}} />
                        <div style={{ marginBottom: 16 }}>
                            <Text strong>Rincian Tagihan:</Text>
                            <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #d9d9d9', borderRadius: 8, marginTop: 8, backgroundColor: '#fff' }}>
                                {!initialValues ? (
                                    isSearching ? <div style={{ padding: 30, textAlign: 'center' }}><Spin /></div> : invoiceList.length === 0 ? <Empty description="Pilih pelanggan" /> : (
                                        <List dataSource={invoiceList} renderItem={(item) => (
                                            <InvoiceListItem key={item.id} item={item} isSelected={selectedInvoiceIds.includes(item.id)} allocation={paymentAllocations[item.id]} onToggle={handleToggle} onNominalChange={handleNominalChange} readOnly={false} />
                                        )} />
                                    )
                                ) : (
                                    isLoadingHistory ? <div style={{ padding: 30, textAlign: 'center' }}><Spin /></div> : (
                                        <List dataSource={historyList} renderItem={(item) => (
                                            <InvoiceListItem key={item.id} item={item} isSelected={true} allocation={item.amountAllocated} readOnly={true} />
                                        )} />
                                    )
                                )}
                            </div>
                        </div>
                        <Form.Item label="Keterangan" name="keterangan"><Input.TextArea rows={2} /></Form.Item>
                    </Form>
                 </Spin>
            </Modal>
        </>
    );
};

export default PembayaranForm;