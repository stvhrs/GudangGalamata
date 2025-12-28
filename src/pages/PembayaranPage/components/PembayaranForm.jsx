import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Modal, Form, Input, InputNumber, DatePicker, Upload, Button,
    Typography, message, List, Checkbox, Row, Col, Empty, Tag, Spin, Divider, Select
} from 'antd';
import { DeleteOutlined, SaveOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

import { usePelangganStream } from '../../../hooks/useFirebaseData';
import { db, storage } from '../../../api/firebase'; 
import {
    ref, update, get, query, orderByChild, orderByKey,
    startAt, endAt, equalTo
} from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

const { Text } = Typography;
const { Option } = Select;

const SOURCE_DEFAULT = 'INVOICE_PAYMENT'; 
const ARAH_TRANSAKSI = 'IN';

// Formatter Desimal (Presisi)
const currencyFormatter = (value) =>
    new Intl.NumberFormat('id-ID', { 
        style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 2 
    }).format(value);

const generateAllocationId = (paymentId, invoiceId) => `ALLOC_${paymentId}_${invoiceId}`;

// --- COMPONENT LIST ITEM (UI DIPERBESAR) ---
const InvoiceListItem = React.memo(({ item, isSelected, allocation, onToggle, onNominalChange, readOnly }) => {
    const totalRetur = Number(item.totalRetur) || 0;
    
    return (
        <List.Item 
            style={{ 
                padding: '12px 16px', // Padding diperbesar
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
                        
                        {/* Rincian Angka */}
                        <div style={{ fontSize: 13, marginTop: 4, background: '#fafafa', padding: 8, borderRadius: 6, border: '1px solid #f0f0f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{color: '#555'}}>Netto (Bruto-Disc):</span>
                                <span style={{fontWeight: 500}}>{currencyFormatter(item.totalNetto)}</span>
                            </div>
                            {totalRetur > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cf1322', marginBottom: 2 }}>
                                    <span>Dikurangi Retur:</span>
                                    <span>-{currencyFormatter(totalRetur)}</span>
                                </div>
                            )}
                             <div style={{ display: 'flex', justifyContent: 'space-between', color: '#096dd9', marginBottom: 4 }}>
                                <span>Sudah Bayar:</span>
                                <span>-{currencyFormatter(item.sudahBayar)}</span>
                            </div>
                            
                            <div style={{ borderTop: '1px dashed #ccc', margin: '4px 0', padding: 0 }} />

                            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 13 }}>
                                <span>{readOnly ? 'Sisa Awal' : 'Sisa Tagihan'}:</span>
                                <span style={{ color: item.sisaTagihan > 0.01 ? '#fa541c' : '#389e0d', fontSize: 14 }}>
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
                                    min={0} max={item.sisaTagihan} status={!allocation ? 'error' : ''}
                                    decimalSeparator="," step={0.01}
                                    formatter={value => !value && value !== 0 ? '' : String(value).replace('.',',')}
                                    parser={value => value ? value.replace(/[^\d,]/g, '').replace(',','.') : ''}
                                />
                            ) : <Tag color="red" style={{ fontSize: 11, padding: '2px 8px' }}>BELUM</Tag>
                        )}
                    </Col>
                </Row>
            </div>
        </List.Item>
    );
}, (prev, next) => {
    return prev.item.id === next.item.id && prev.isSelected === next.isSelected && prev.allocation === next.allocation && prev.readOnly === next.readOnly;
});

// --- MAIN COMPONENT ---
const PembayaranForm = ({ open, onCancel, initialValues }) => {
    const [form] = Form.useForm();
    const [modal, contextHolder] = Modal.useModal();
    const selectedDate = Form.useWatch('tanggal', form);
    
    const { pelangganList: rawPelangganData, loadingPelanggan } = usePelangganStream();
    
    const pelangganList = useMemo(() => {
        if (!rawPelangganData) return [];
        let processed = [];
        if (Array.isArray(rawPelangganData)) processed = rawPelangganData;
        else if (typeof rawPelangganData === 'object') processed = Object.keys(rawPelangganData).map(key => ({ id: key, ...rawPelangganData[key] }));
        return processed.map(p => ({ ...p, displayName: p.nama || p.name || p.namaPelanggan || `(ID:${p.id})` }));
    }, [rawPelangganData]);

    const [selectedCustomerName, setSelectedCustomerName] = useState(null);
    const [fileList, setFileList] = useState([]);
    const [invoiceList, setInvoiceList] = useState([]); 
    const [historyList, setHistoryList] = useState([]); 
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
    const [paymentAllocations, setPaymentAllocations] = useState({});
    const [isSearching, setIsSearching] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isGeneratingId, setIsGeneratingId] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [totalInputAmount, setTotalInputAmount] = useState(0);

    const maxPayableAmount = useMemo(() => {
        return invoiceList.reduce((sum, item) => sum + (Number(item.sisaTagihan) || 0), 0);
    }, [invoiceList]);

    useEffect(() => {
        if (!open) resetFormState();
        else if (initialValues) {
            form.setFieldsValue({
                id: initialValues.id,
                tanggal: dayjs(initialValues.tanggal),
                keterangan: initialValues.keterangan
            });
            setTotalInputAmount(initialValues.totalBayar);
            setSelectedCustomerName(initialValues.namaCustomer);
            fetchPaymentHistory(initialValues.id);
        } else {
            form.resetFields();
            form.setFieldsValue({ tanggal: dayjs(), keterangan: '' });
        }
    }, [initialValues, open, form]);

    const resetFormState = () => {
        form.resetFields();
        setFileList([]);
        setSelectedInvoiceIds([]);
        setInvoiceList([]);
        setHistoryList([]);
        setPaymentAllocations({});
        setSelectedCustomerName(null);
        setTotalInputAmount(0);
        setIsSearching(false);
        setIsLoadingHistory(false);
    };

    const fetchPaymentHistory = async (paymentId) => {
        setIsLoadingHistory(true);
        try {
            const allocQuery = query(ref(db, 'payment_allocations'), orderByChild('paymentId'), equalTo(paymentId));
            const allocSnap = await get(allocQuery);
            if (allocSnap.exists()) {
                const allocations = allocSnap.val();
                const promises = Object.values(allocations).map(async (alloc) => {
                    const invSnap = await get(ref(db, `invoices/${alloc.invoiceId}`));
                    let invData = {};
                    if (invSnap.exists()) invData = invSnap.val();
                    
                    const netto = Number(invData.totalNetto) || 0; 
                    const retur = Number(invData.totalRetur) || 0; 
                    const bayarTotal = Number(invData.totalBayar) || 0;
                    
                    // Rumus: Sisa = Netto - Retur - Bayar
                    const sisa = netto - retur - bayarTotal;

                    return {
                        id: alloc.invoiceId,
                        namaCustomer: invData.namaCustomer || 'Unknown',
                        tanggal: invData.tanggal || 0,
                        totalNetto: netto,
                        totalRetur: retur,
                        sudahBayar: bayarTotal,
                        sisaTagihan: sisa, 
                        amountAllocated: alloc.amount
                    };
                });
                const historyData = await Promise.all(promises);
                setHistoryList(historyData);
            } else setHistoryList([]);
        } catch (error) { message.error("Gagal mengambil rincian alokasi."); } 
        finally { setIsLoadingHistory(false); }
    };

    useEffect(() => {
        if (initialValues || !open) return;
        let isMounted = true;
        setIsGeneratingId(true);
        const generateId = async () => {
            try {
                const dateBasis = selectedDate ? dayjs(selectedDate) : dayjs();
                const dateFormat = dateBasis.format('YYMMDD');
                const keyPrefix = `PY-${dateFormat}-`;
                const q = query(ref(db, 'payments'), orderByKey(), startAt(keyPrefix), endAt(keyPrefix + '\uf8ff'));
                const snapshot = await get(q);
                let nextNum = 1;
                if (snapshot.exists()) {
                    const keys = Object.keys(snapshot.val()).sort();
                    const lastKey = keys[keys.length - 1];
                    const parts = lastKey.split('-');
                    const num = parseInt(parts[parts.length - 1], 10);
                    if (!isNaN(num)) nextNum = num + 1;
                }
                if (isMounted) form.setFieldsValue({ id: `${keyPrefix}${String(nextNum).padStart(3, '0')}` });
            } catch (error) { console.error("Error generate ID:", error); } 
            finally { if (isMounted) setIsGeneratingId(false); }
        };
        generateId();
        return () => { isMounted = false; };
    }, [initialValues, open, selectedDate, form]);

    const handleCustomerSelect = async (namaPelanggan) => {
        if (!namaPelanggan) return;
        setSelectedCustomerName(namaPelanggan);
        setIsSearching(true);
        const exactNameUpper = namaPelanggan.toUpperCase(); 
        try {
            const targetStatus = `${exactNameUpper}_BELUM`;
            const q = query(ref(db, 'invoices'), orderByChild('compositeStatus'), equalTo(targetStatus));
            const snap = await get(q);
            let results = [];
            
            if (snap.exists()) {
                snap.forEach((child) => {
                    const val = child.val();
                    
                    const totalNetto = Number(val.totalNetto) || 0;
                    const totalRetur = Number(val.totalRetur) || 0;
                    const sudahBayar = Number(val.totalBayar) || 0;
                    
                    // 🔥 RUMUS: Sisa = Netto - Retur - Bayar
                    const sisaTagihan = totalNetto - totalRetur - sudahBayar;

                    // Filter > 0.01 untuk keamanan desimal
                    if (sisaTagihan > 0.01) { 
                        results.push({ 
                            id: child.key, 
                            ...val, 
                            totalNetto, 
                            totalRetur,
                            sudahBayar, 
                            sisaTagihan 
                        });
                    }
                });
            }
            results.sort((a, b) => dayjs(a.tanggal).valueOf() - dayjs(b.tanggal).valueOf());
            if (results.length === 0) message.info(`Tidak ada tagihan BELUM LUNAS untuk "${namaPelanggan}".`);
            setInvoiceList(results);
            setTotalInputAmount(0);
            setPaymentAllocations({});
            setSelectedInvoiceIds([]);
        } catch (err) { message.error("Gagal mengambil data tagihan."); } 
        finally { setIsSearching(false); }
    };

    const distributeAmount = useCallback((amountToDistribute) => {
        if (invoiceList.length === 0) return;
        let remainingMoney = amountToDistribute;
        let newAllocations = {};
        let newSelectedIds = [];
        
        for (const invoice of invoiceList) {
            if (remainingMoney <= 0) break;
            const amountNeeded = invoice.sisaTagihan;
            let amountToPay = remainingMoney >= amountNeeded ? amountNeeded : remainingMoney;
            
            // Tanpa pembulatan paksa, gunakan desimal apa adanya
            remainingMoney = remainingMoney >= amountNeeded ? remainingMoney - amountNeeded : 0;
            
            newAllocations[invoice.id] = amountToPay;
            newSelectedIds.push(invoice.id);
        }
        setPaymentAllocations(newAllocations);
        setSelectedInvoiceIds(newSelectedIds);
    }, [invoiceList]);

    const handleTotalBayarChange = (val) => {
        let amount = val || 0;
        if (amount > maxPayableAmount) amount = maxPayableAmount; 
        setTotalInputAmount(amount);
        distributeAmount(amount);
    };

    const handleNominalChange = (val, invoiceId) => {
        const value = val || 0;
        setPaymentAllocations(prev => {
            const newAlloc = { ...prev };
            if (value <= 0) {
                delete newAlloc[invoiceId];
                setSelectedInvoiceIds(prevIds => prevIds.filter(id => id !== invoiceId));
            } else newAlloc[invoiceId] = value;
            let newTotal = Object.values(newAlloc).reduce((a, b) => a + b, 0);
            if (newTotal > maxPayableAmount) newTotal = maxPayableAmount;
            setTotalInputAmount(newTotal);
            return newAlloc;
        });
    };

    const handleToggle = (invoiceId, checked) => {
        if (checked) {
            const invoice = invoiceList.find(i => i.id === invoiceId);
            setPaymentAllocations(prev => {
                const newAlloc = { ...prev, [invoiceId]: invoice.sisaTagihan };
                let newTotal = Object.values(newAlloc).reduce((a, b) => a + b, 0);
                if (newTotal > maxPayableAmount) newTotal = maxPayableAmount;
                setTotalInputAmount(newTotal);
                return newAlloc;
            });
            setSelectedInvoiceIds(prev => [...prev, invoiceId]);
        } else {
            setPaymentAllocations(prev => {
                const newAlloc = { ...prev };
                delete newAlloc[invoiceId];
                let newTotal = Object.values(newAlloc).reduce((a, b) => a + b, 0);
                setTotalInputAmount(newTotal);
                return newAlloc;
            });
            setSelectedInvoiceIds(prev => prev.filter(id => id !== invoiceId));
        }
    };

    // --- DELETE ---
    const handleDelete = () => {
        modal.confirm({
            title: 'Hapus Pembayaran?',
            content: 'Data pembayaran akan dihapus, saldo invoice dikembalikan, dan Saldo Customer akan berkurang (Revert Plus).',
            okText: 'Hapus Permanen',
            okType: 'danger',
            cancelText: 'Batal',
            onOk: async () => {
                setIsSaving(true);
                try {
                    const paymentId = initialValues.id;
                    const customerId = initialValues.customerId;
                    const amountPaid = Number(initialValues.totalBayar) || 0;

                    const updates = {};
                    updates[`payments/${paymentId}`] = null;
                    
                    const allocRef = query(ref(db, 'payment_allocations'), orderByChild('paymentId'), equalTo(paymentId));
                    const snapshot = await get(allocRef);
                    if (snapshot.exists()) {
                        const allocations = snapshot.val();
                        const promises = Object.keys(allocations).map(async (key) => {
                            const allocItem = allocations[key];
                            const invId = allocItem.invoiceId;
                            const amount = Number(allocItem.amount) || 0;
                            
                            updates[`payment_allocations/${key}`] = null;
                            
                            // Revert Invoice
                            const invSnap = await get(ref(db, `invoices/${invId}`));
                            if(invSnap.exists()){
                                const invData = invSnap.val();
                                const currentNetto = Number(invData.totalNetto) || 0;
                                const currentRetur = Number(invData.totalRetur) || 0;
                                const currentBayar = Number(invData.totalBayar) || 0;
                                
                                const newTotalBayar = Math.max(0, currentBayar - amount);
                                
                                // 🔥 UPDATE SISA TAGIHAN PROPERTY SAAT DELETE
                                const newSisaTagihan = currentNetto - currentRetur - newTotalBayar;

                                const customerName = invData.namaCustomer || 'UNKNOWN';
                                const newStatus = 'BELUM'; 
                                const newComposite = `${customerName.toUpperCase()}_${newStatus}`;
                                
                                updates[`invoices/${invId}/totalBayar`] = newTotalBayar;
                                updates[`invoices/${invId}/sisaTagihan`] = newSisaTagihan; // Update Property
                                updates[`invoices/${invId}/statusPembayaran`] = newStatus;
                                updates[`invoices/${invId}/compositeStatus`] = newComposite;
                                updates[`invoices/${invId}/updatedAt`] = Date.now();
                            }
                        });
                        await Promise.all(promises);
                    }

                    // Revert Saldo Customer
                    if (customerId && customerId !== 'UNKNOWN') {
                        const custSnap = await get(ref(db, `customers/${customerId}`));
                        if (custSnap.exists()) {
                            const currentSaldo = Number(custSnap.val().saldoAkhir) || 0;
                            updates[`customers/${customerId}/saldoAkhir`] = currentSaldo - amountPaid;
                            updates[`customers/${customerId}/updatedAt`] = Date.now();
                        }
                    }

                    await update(ref(db), updates);
                    message.success('Pembayaran dihapus.');
                    onCancel();
                } catch (error) { console.error("Delete Error:", error); message.error("Gagal menghapus data."); } 
                finally { setIsSaving(false); }
            }
        });
    };

    // --- SAVE ---
    const handleSave = async (values) => {
        if (selectedInvoiceIds.length === 0 || totalInputAmount <= 0) return message.error("Mohon masukkan nominal pembayaran.");
        
        setIsSaving(true);
        message.loading({ content: 'Menyimpan...', key: 'saving' });

        try {
            const timestampNow = Date.now();
            const paymentId = values.id; 
            const firstInv = invoiceList.find(i => i.id === selectedInvoiceIds[0]);

            let buktiUrl = null;
            if (fileList.length > 0 && fileList[0].originFileObj) {
                const safeName = `bukti_${paymentId}`;
                const fileRef = storageRef(storage, `bukti_pembayaran/${safeName}`);
                await uploadBytes(fileRef, fileList[0].originFileObj);
                buktiUrl = await getDownloadURL(fileRef);
            }

            const updates = {};
            const customerName = selectedCustomerName || firstInv?.namaCustomer || 'UNKNOWN';
            const customerData = pelangganList.find(p => p.displayName === customerName);
            const customerId = customerData?.id || firstInv?.customerId || 'UNKNOWN';

            const paymentData = {
                id: paymentId,
                arah: ARAH_TRANSAKSI,
                sumber: SOURCE_DEFAULT,
                tanggal: dayjs(values.tanggal).valueOf(),
                totalBayar: totalInputAmount,
                customerId: customerId,
                namaCustomer: customerName,
                keterangan: values.keterangan || '-',
                buktiUrl: buktiUrl,
                createdAt: timestampNow,
                updatedAt: timestampNow
            };
            updates[`payments/${paymentId}`] = paymentData;

            // Update Saldo Customer (+)
            if (customerId && customerId !== 'UNKNOWN') {
                const custSnap = await get(ref(db, `customers/${customerId}`));
                let currentSaldo = 0;
                if (custSnap.exists()) {
                    currentSaldo = Number(custSnap.val().saldoAkhir) || 0;
                }
                updates[`customers/${customerId}/saldoAkhir`] = currentSaldo + totalInputAmount;
                updates[`customers/${customerId}/updatedAt`] = timestampNow;
            }

            // Update Invoice & Allocations
            selectedInvoiceIds.forEach(invId => {
                const invoiceRef = invoiceList.find(i => i.id === invId);
                const amountAllocated = Number(paymentAllocations[invId]); 
                const allocationId = generateAllocationId(paymentId, invId);
                
                updates[`payment_allocations/${allocationId}`] = {
                    id: allocationId,
                    paymentId: paymentId,
                    invoiceId: invId,
                    amount: amountAllocated,
                    createdAt: timestampNow,
                    updatedAt: timestampNow
                };

                const totalNetto = Number(invoiceRef.totalNetto) || 0; 
                const totalRetur = Number(invoiceRef.totalRetur) || 0; 
                const currentSudahBayar = Number(invoiceRef.sudahBayar) || 0;
                
                const newTotalBayar = currentSudahBayar + amountAllocated;

                // 🔥 UPDATE SISA TAGIHAN PROPERTY SAAT SAVE
                const newSisaTagihan = totalNetto - totalRetur - newTotalBayar;

                let newStatus = 'BELUM';
                // Lunas jika sisa <= 0.01 (floating point safety)
                if (newSisaTagihan <= 0.01) newStatus = 'LUNAS';

                const finalCustomerName = invoiceRef.namaCustomer || customerName;
                const newComposite = `${finalCustomerName.toUpperCase()}_${newStatus}`;

                updates[`invoices/${invId}/totalBayar`] = newTotalBayar;
                updates[`invoices/${invId}/sisaTagihan`] = newSisaTagihan; // Update Property
                updates[`invoices/${invId}/statusPembayaran`] = newStatus;
                updates[`invoices/${invId}/compositeStatus`] = newComposite;
                updates[`invoices/${invId}/updatedAt`] = timestampNow;
            });

            await update(ref(db), updates);
            message.success({ content: `Tersimpan! ID: ${paymentId}`, key: 'saving' });
            onCancel();

        } catch (error) {
            console.error(error);
            message.error({ content: `Gagal: ${error.message}`, key: 'saving' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            {contextHolder}
            <Modal
                style={{ top: 20 }}
                open={open}
                title={initialValues ? "Detail Pembayaran" : "Input Pembayaran Customer"}
                onCancel={onCancel}
                width={750}
                maskClosable={false}
                footer={[
                    initialValues && <Button key="delete" danger icon={<DeleteOutlined />} onClick={handleDelete} loading={isSaving}>Hapus</Button>,
                    <Button key="back" onClick={onCancel} disabled={isSaving}>Batal</Button>,
                    !initialValues && <Button key="submit" type="primary" loading={isSaving} icon={<SaveOutlined />} onClick={() => form.submit()}>Simpan Pembayaran</Button>
                ]}
            >
                 <Spin spinning={isGeneratingId}>
                    <Form form={form} layout="vertical" onFinish={handleSave}>
                        <div style={{ background: '#f5f5f5', padding: '12px', borderRadius: 8, marginBottom: 16 }}>
                            <Row gutter={12}>
                                <Col span={12}><Form.Item name="id" label="No. Pembayaran"><Input disabled style={{ fontWeight: 'bold' }} placeholder="Auto..." /></Form.Item></Col>
                                <Col span={12}><Form.Item name="tanggal" label="Tanggal Pembayaran" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabled={!!initialValues} allowClear={false} /></Form.Item></Col>
                            </Row>
                        </div>

                        {!initialValues && (
                            <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                                <Row gutter={16}>
                                    <Col span={12}>
                                        <Form.Item label="1. Pilih Customer" style={{marginBottom: 8}} required>
                                            <Select showSearch placeholder="Ketik atau Pilih Nama..." optionFilterProp="children" loading={loadingPelanggan} disabled={loadingPelanggan} onChange={handleCustomerSelect} value={selectedCustomerName} style={{ width: '100%' }} filterOption={(input, option) => (option?.children ?? '').toLowerCase().includes(input.toLowerCase())}>
                                                {pelangganList.map(p => (<Option key={p.id} value={p.displayName}>{p.displayName}</Option>))}
                                            </Select>
                                        </Form.Item>
                                        {invoiceList.length > 0 && <Tag color="blue">Total Sisa Tagihan: {currencyFormatter(maxPayableAmount)}</Tag>}
                                    </Col>
                                    <Col span={12}>
                                        <Form.Item label="2. Total Uang Diterima" style={{marginBottom: 8}} required>
                                            <InputNumber style={{ width: '100%', fontWeight: 'bold', fontSize: 16 }} value={totalInputAmount} onChange={handleTotalBayarChange} placeholder="Input Nominal..." disabled={invoiceList.length === 0} max={maxPayableAmount} 
                                            decimalSeparator="," step={0.01} formatter={value => !value && value !== 0 ? 'Rp 0' : `Rp ${String(value).replace(/\./g,',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`} parser={value => value ? value.replace(/[^\d,]/g, '').replace(',','.') : ''}/>
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </div>
                        )}

                        <Divider dashed style={{margin: '12px 0'}} />
                        <div style={{ marginBottom: 16 }}>
                            <Text strong>{initialValues ? "3. Rincian Invoice yang Dibayar:" : "3. Rincian Alokasi ke Tagihan:"}</Text>
                            <div style={{ maxHeight: '350px', overflowY: 'auto', border: '1px solid #d9d9d9', borderRadius: 8, marginTop: 8, backgroundColor: '#fff' }}>
                                {!initialValues ? (
                                    isSearching ? <div style={{ padding: 30, textAlign: 'center' }}><Spin tip="Mengambil tagihan..." /></div> : invoiceList.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={selectedCustomerName ? "Lunas semua / Tidak ada tagihan" : "Pilih pelanggan dulu"} style={{margin: '20px 0'}} /> : (
                                        <List dataSource={invoiceList} renderItem={(item) => (
                                            <InvoiceListItem key={item.id} item={item} isSelected={selectedInvoiceIds.includes(item.id)} allocation={paymentAllocations[item.id]} onToggle={handleToggle} onNominalChange={handleNominalChange} readOnly={false} />
                                        )} />
                                    )
                                ) : (
                                    isLoadingHistory ? <div style={{ padding: 30, textAlign: 'center' }}><Spin tip="Memuat rincian..." /></div> : historyList.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Data alokasi tidak ditemukan" /> : (
                                        <List dataSource={historyList} renderItem={(item) => (
                                            <InvoiceListItem key={item.id} item={item} isSelected={true} allocation={item.amountAllocated} readOnly={true} onToggle={() => {}} onNominalChange={() => {}} />
                                        )} />
                                    )
                                )}
                            </div>
                        </div>

                        <Form.Item label="Keterangan (Opsional)" name="keterangan"><Input.TextArea rows={2} placeholder="Catatan tambahan..." /></Form.Item>
                        <Form.Item label="Upload Bukti (Opsional)" >
                             <Upload listType="picture" fileList={fileList} maxCount={1} beforeUpload={() => false} onChange={({ fileList: newFileList }) => setFileList(newFileList)}>
                                <Button icon={<PlusOutlined />}>Pilih Gambar</Button>
                             </Upload>
                        </Form.Item>
                    </Form>
                </Spin>
            </Modal>
        </>
    );
};

export default PembayaranForm;