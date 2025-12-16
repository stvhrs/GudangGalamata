import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Modal, Form, Input, InputNumber, DatePicker, Upload, Button,
    Typography, message, List, Checkbox, Row, Col, Empty, Tag, Spin, Divider, Select
} from 'antd';
import { DeleteOutlined, SaveOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

// --- IMPORT HOOK PELANGGAN (Sesuaikan path jika perlu) ---
import { usePelangganStream } from '../../../hooks/useFirebaseData';

// IMPORT FIREBASE (Sesuaikan path jika perlu)
import { db, storage } from '../../../api/firebase'; 
import {
    ref, update, get, query, orderByChild, orderByKey,
    startAt, endAt, equalTo, limitToLast
} from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

const { Text } = Typography;
const { Option } = Select;

// --- KONFIGURASI ---
const SOURCE_DEFAULT = 'INVOICE_PAYMENT'; 
const ARAH_TRANSAKSI = 'IN';

// UPDATED: Formatter mata uang mendukung koma
const currencyFormatter = (value) =>
    new Intl.NumberFormat('id-ID', { 
        style: 'currency', 
        currency: 'IDR', 
        minimumFractionDigits: 0,
        maximumFractionDigits: 2 // Mengizinkan sampai 2 desimal
    }).format(value);

const generateAllocationId = (paymentId, invoiceId) => `ALLOC_${paymentId}_${invoiceId}`;

const getBase64 = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
    });

// --- LIST ITEM COMPONENT ---
const InvoiceListItem = React.memo(({ item, isSelected, allocation, onToggle, onNominalChange, readOnly }) => {
    return (
        <List.Item 
            style={{ 
                padding: '8px 12px', 
                background: isSelected ? '#e6f7ff' : '#fff', 
                borderBottom: '1px solid #f0f0f0',
                transition: 'all 0.3s'
            }}
            actions={!readOnly ? [
                 <Checkbox
                    checked={isSelected}
                    onChange={(e) => onToggle(item.id, e.target.checked)}
                />
            ] : []}
        >
            <div style={{ width: '100%', marginRight: 16 }}>
                <Row align="middle" gutter={8}>
                    <Col flex="auto">
                        <div style={{ fontWeight: 'bold', fontSize: 13, color: 'rgba(0, 0, 0, 0.88)' }}>
                            {item.namaCustomer}
                        </div>
                        <div style={{ fontSize: 11, color: '#666' }}>
                            {item.id} • {dayjs(item.tanggal).format('DD MMM YY')}
                        </div>
                        <div style={{ fontSize: 11, marginTop: 2 }}>
                            {/* TAMPILKAN LOGIKA HITUNGAN BIAR JELAS */}
                            <span style={{color: '#555'}}>
                                Netto: {currencyFormatter(item.totalNetto)} <br/>
                                Sudah Bayar: {currencyFormatter(item.sudahBayar)}
                            </span>
                            <div style={{marginTop: 4}}>
                                {readOnly ? 'Sisa Awal:' : 'Sisa Tagihan:'} <Text type="danger" strong>{currencyFormatter(item.sisaTagihan)}</Text>
                            </div>
                        </div>
                    </Col>

                    <Col>
                        {readOnly ? (
                            <div style={{textAlign: 'right'}}>
                                <div style={{fontSize: 10, color: '#666'}}>Bayar Skrg:</div>
                                <Text strong style={{color: '#1890ff'}}>
                                    {currencyFormatter(allocation)}
                                </Text>
                            </div>
                        ) : (
                            isSelected ? (
                                <InputNumber
                                    value={allocation}
                                    onChange={(v) => onNominalChange(v, item.id)}
                                    style={{ width: 140, fontSize: 13 }}
                                    placeholder="Nominal"
                                    min={0} 
                                    max={item.sisaTagihan} 
                                    status={!allocation ? 'error' : ''}
                                    
                                    // UPDATED: Support Desimal di item list juga
                                    decimalSeparator=","
                                    step={0.01}
                                    formatter={value => {
                                        if (!value && value !== 0) return '';
                                        const str = String(value);
                                        const parts = str.split('.');
                                        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                                        return parts.join(',');
                                    }}
                                    parser={value => {
                                        if (!value) return '';
                                        let val = value.replace(/[^\d,]/g, ''); // Hapus selain angka & koma
                                        return val.replace(',', '.'); // Ubah koma ke titik
                                    }}
                                />
                            ) : (
                                <Tag color="red" style={{ fontSize: 10 }}>
                                    BELUM
                                </Tag>
                            )
                        )}
                    </Col>
                </Row>
            </div>
        </List.Item>
    );
}, (prev, next) => {
    return prev.item.id === next.item.id &&
        prev.isSelected === next.isSelected &&
        prev.allocation === next.allocation &&
        prev.readOnly === next.readOnly;
});

const PembayaranForm = ({ open, onCancel, initialValues }) => {
    const [form] = Form.useForm();
    const [modal, contextHolder] = Modal.useModal();

    // --- DATA PELANGGAN ---
    const { pelangganList: rawPelangganData, loadingPelanggan } = usePelangganStream();
    
    const pelangganList = useMemo(() => {
        if (!rawPelangganData) return [];
        let processed = [];
        if (Array.isArray(rawPelangganData)) {
            processed = rawPelangganData;
        } else if (typeof rawPelangganData === 'object') {
            processed = Object.keys(rawPelangganData).map(key => ({
                id: key,
                ...rawPelangganData[key]
            }));
        }
        return processed.map(p => ({
            ...p,
            displayName: p.nama || p.name || p.namaPelanggan || `(ID:${p.id})`
        }));
    }, [rawPelangganData]);

    // --- STATE ---
    const [selectedCustomerName, setSelectedCustomerName] = useState(null);
    const [fileList, setFileList] = useState([]);
    
    // eslint-disable-next-line no-unused-vars
    const [previewOpen, setPreviewOpen] = useState(false);
    // eslint-disable-next-line no-unused-vars
    const [previewImage, setPreviewImage] = useState('');

    const [invoiceList, setInvoiceList] = useState([]); 
    const [historyList, setHistoryList] = useState([]); 
    
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
    const [paymentAllocations, setPaymentAllocations] = useState({});

    const [isSearching, setIsSearching] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    const [totalInputAmount, setTotalInputAmount] = useState(0);

    const maxPayableAmount = useMemo(() => {
        return invoiceList.reduce((sum, item) => sum + (Number(item.sisaTagihan) || 0), 0);
    }, [invoiceList]);

    // --- INITIAL LOAD ---
    useEffect(() => {
        if (!open) {
            resetFormState();
        } else {
            if (initialValues) {
                form.setFieldsValue({
                    tanggal: dayjs(initialValues.tanggal),
                    keterangan: initialValues.keterangan
                });
                setTotalInputAmount(initialValues.totalBayar);
                setSelectedCustomerName(initialValues.namaCustomer);
                fetchPaymentHistory(initialValues.id);
            } else {
                form.resetFields();
                form.setFieldsValue({ 
                    tanggal: dayjs(), 
                    keterangan: '' 
                });
            }
        }
    }, [initialValues, open, form]);

    const resetFormState = () => {
        form.resetFields();
        setFileList([]);
        setPreviewImage('');
        setSelectedInvoiceIds([]);
        setInvoiceList([]);
        setHistoryList([]);
        setPaymentAllocations({});
        setSelectedCustomerName(null);
        setTotalInputAmount(0);
        setIsSearching(false);
        setIsLoadingHistory(false);
    };

    // --- FETCH HISTORY (VIEW MODE) ---
    const fetchPaymentHistory = async (paymentId) => {
        setIsLoadingHistory(true);
        try {
            const allocQuery = query(
                ref(db, 'payment_allocations'),
                orderByChild('paymentId'),
                equalTo(paymentId)
            );
            const allocSnap = await get(allocQuery);

            if (allocSnap.exists()) {
                const allocations = allocSnap.val();
                const promises = Object.values(allocations).map(async (alloc) => {
                    const invSnap = await get(ref(db, `invoices/${alloc.invoiceId}`));
                    let invData = {};
                    if (invSnap.exists()) {
                        invData = invSnap.val();
                    }
                    
                    const netto = Number(invData.totalNetto) || 0;
                    const bayarTotal = Number(invData.totalBayar) || 0;
                    // Sisa saat ini (setelah dibayar)
                    const sisa = netto - bayarTotal;

                    return {
                        id: alloc.invoiceId,
                        namaCustomer: invData.namaCustomer || 'Unknown',
                        tanggal: invData.tanggal || 0,
                        totalNetto: netto,
                        sudahBayar: bayarTotal,
                        sisaTagihan: sisa, 
                        amountAllocated: alloc.amount
                    };
                });
                const historyData = await Promise.all(promises);
                setHistoryList(historyData);
            } else {
                setHistoryList([]);
            }
        } catch (error) {
            console.error("Error fetching history:", error);
            message.error("Gagal mengambil rincian alokasi.");
        } finally {
            setIsLoadingHistory(false);
        }
    };

    const generateCustomPaymentId = async (inputDate) => {
        const dateStr = dayjs(inputDate).format('YY-MM-DD'); 
        const prefix = `PY-${dateStr}-`;
        const paymentsRef = ref(db, 'payments');
        const q = query(paymentsRef, orderByKey(), startAt(prefix), endAt(prefix + '\uf8ff'), limitToLast(1));
        const snapshot = await get(q);
        let nextIndex = 1;
        if (snapshot.exists()) {
            const lastId = Object.keys(snapshot.val())[0];
            const lastIndexNum = parseInt(lastId.split('-').pop(), 10);
            if (!isNaN(lastIndexNum)) nextIndex = lastIndexNum + 1;
        }
        return `${prefix}${String(nextIndex).padStart(4, '0')}`;
    };

    // --- SEARCH INVOICE (CREATE MODE) ---
    const handleCustomerSelect = async (namaPelanggan) => {
        if (!namaPelanggan) return;
        
        setSelectedCustomerName(namaPelanggan);
        setIsSearching(true);
        
        const exactNameUpper = namaPelanggan.toUpperCase(); 

        try {
            // FILTER LANGSUNG: Hanya ambil yang compositeStatusnya "NAMA_BELUM"
            const targetStatus = `${exactNameUpper}_BELUM`;

            const q = query(
                ref(db, 'invoices'), 
                orderByChild('compositeStatus'), 
                equalTo(targetStatus)
            );

            const snap = await get(q);
            let results = [];
            
            if (snap.exists()) {
                snap.forEach((child) => {
                    const val = child.val();
                    
                    // --- LOGIKA HITUNG SISA HUTANG ---
                    // Hutang = Total Netto - Total yang sudah dibayar
                    const totalNetto = Number(val.totalNetto) || 0;
                    const sudahBayar = Number(val.totalBayar) || 0;
                    const sisaTagihan = totalNetto - sudahBayar;
                    
                    // Ambil jika masih ada sisa (toleransi koma)
                    if (sisaTagihan > 100) { 
                        results.push({
                            id: child.key,
                            ...val,
                            totalNetto: totalNetto,
                            sudahBayar: sudahBayar,
                            sisaTagihan: sisaTagihan
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

        } catch (err) {
            console.error(err);
            message.error("Gagal mengambil data tagihan.");
        } finally {
            setIsSearching(false);
        }
    };

    const distributeAmount = useCallback((amountToDistribute) => {
        if (invoiceList.length === 0) return;
        let remainingMoney = amountToDistribute;
        let newAllocations = {};
        let newSelectedIds = [];

        for (const invoice of invoiceList) {
            if (remainingMoney <= 0) break;
            const amountNeeded = invoice.sisaTagihan;
            // Gunakan parseFloat untuk memastikan presisi desimal
            let amountToPay = remainingMoney >= amountNeeded ? amountNeeded : remainingMoney;
            
            // Fix javascript floating point issues
            amountToPay = Math.round(amountToPay * 100) / 100;
            
            remainingMoney = remainingMoney >= amountNeeded ? remainingMoney - amountNeeded : 0;
            
            newAllocations[invoice.id] = amountToPay;
            newSelectedIds.push(invoice.id);
        }
        setPaymentAllocations(newAllocations);
        setSelectedInvoiceIds(newSelectedIds);
    }, [invoiceList]);

    const handleTotalBayarChange = (val) => {
        let amount = val || 0;
        // Tidak perlu replace manual karena parser InputNumber sudah menanganinya
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
            } else {
                newAlloc[invoiceId] = value;
            }
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

    // --- DELETE HANDLER (ROLLBACK) ---
    const handleDelete = () => {
        modal.confirm({
            title: 'Hapus Pembayaran?',
            content: 'Data pembayaran akan dihapus dan saldo invoice akan dikembalikan.',
            okText: 'Hapus Permanen',
            okType: 'danger',
            cancelText: 'Batal',
            onOk: async () => {
                setIsSaving(true);
                try {
                    const paymentId = initialValues.id;
                    const updates = {};
                    updates[`payments/${paymentId}`] = null;

                    const allocRef = query(ref(db, 'payment_allocations'), orderByChild('paymentId'), equalTo(paymentId));
                    const snapshot = await get(allocRef);

                    if (snapshot.exists()) {
                        const allocations = snapshot.val();
                        const promises = Object.keys(allocations).map(async (key) => {
                            const allocItem = allocations[key];
                            const invId = allocItem.invoiceId;
                            const amountPaid = Number(allocItem.amount) || 0;
                            
                            updates[`payment_allocations/${key}`] = null;

                            // AMBIL DATA INVOICE
                            const invSnap = await get(ref(db, `invoices/${invId}`));
                            if(invSnap.exists()){
                                const invData = invSnap.val();
                                const currentTotalBayar = Number(invData.totalBayar) || 0;
                                
                                // KURANGI TOTAL BAYAR (Rollback saldo)
                                const newTotalBayar = Math.max(0, currentTotalBayar - amountPaid);
                                
                                // KEMBALIKAN STATUS KE 'BELUM'
                                // Karena pembayaran dihapus, asumsinya dia kembali punya hutang
                                const customerName = invData.namaCustomer || 'UNKNOWN';
                                const newStatus = 'BELUM';
                                const newComposite = `${customerName.toUpperCase()}_${newStatus}`;

                                updates[`invoices/${invId}/totalBayar`] = newTotalBayar;
                                updates[`invoices/${invId}/statusPembayaran`] = newStatus;
                                updates[`invoices/${invId}/compositeStatus`] = newComposite;
                                updates[`invoices/${invId}/updatedAt`] = Date.now();
                            }
                        });
                        await Promise.all(promises);
                    }

                    await update(ref(db), updates);
                    message.success('Pembayaran dihapus. Saldo invoice dikembalikan.');
                    onCancel();
                } catch (error) {
                    console.error("Delete Error:", error);
                    message.error("Gagal menghapus data: " + error.message);
                } finally {
                    setIsSaving(false);
                }
            }
        });
    };

    // --- SAVE HANDLER (UPDATE SALDO AKUMULASI) ---
    const handleSave = async (values) => {
        if (selectedInvoiceIds.length === 0 || totalInputAmount <= 0) {
            return message.error("Mohon masukkan nominal pembayaran.");
        }
        if (selectedInvoiceIds.some(id => !paymentAllocations[id] || paymentAllocations[id] <= 0)) {
            return message.error("Ada invoice terpilih dengan nominal 0.");
        }

        setIsSaving(true);
        message.loading({ content: 'Menyimpan...', key: 'saving' });

        try {
            const timestampNow = Date.now();
            const paymentId = await generateCustomPaymentId(values.tanggal);
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

            selectedInvoiceIds.forEach(invId => {
                const invoiceRef = invoiceList.find(i => i.id === invId);
                const amountAllocated = Number(paymentAllocations[invId]); // Uang yang disetor kali ini
                const allocationId = generateAllocationId(paymentId, invId);
                
                updates[`payment_allocations/${allocationId}`] = {
                    id: allocationId,
                    paymentId: paymentId,
                    invoiceId: invId,
                    amount: amountAllocated,
                    createdAt: timestampNow,
                    updatedAt: timestampNow
                };

                // --- LOGIKA UPDATE INVOICE ---
                const totalNetto = Number(invoiceRef.totalNetto) || 0; // Nilai asli invoice
                const currentSudahBayar = Number(invoiceRef.sudahBayar) || 0; // Yang sudah dibayar sebelumnya
                
                // 1. Tambahkan pembayaran baru ke yang sudah ada
                const newTotalBayar = currentSudahBayar + amountAllocated;

                // 2. Tentukan Status
                let newStatus = 'BELUM';
                
                // Syarat Lunas: Total yang dibayar >= Total Netto (dengan toleransi pembulatan)
                // Jika masih kurang 1 perak pun, status tetap BELUM
                if (newTotalBayar >= (totalNetto - 100)) { 
                    newStatus = 'LUNAS';
                }

                const finalCustomerName = invoiceRef.namaCustomer || customerName;
                const newComposite = `${finalCustomerName.toUpperCase()}_${newStatus}`;

                updates[`invoices/${invId}/totalBayar`] = newTotalBayar; // Simpan akumulasi
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
                    initialValues && (
                        <Button key="delete" danger icon={<DeleteOutlined />} onClick={handleDelete} loading={isSaving}>
                            Hapus
                        </Button>
                    ),
                    <Button key="back" onClick={onCancel} disabled={isSaving}>Batal</Button>,
                    !initialValues && (
                        <Button key="submit" type="primary" loading={isSaving} icon={<SaveOutlined />} onClick={() => form.submit()}>
                            Simpan Pembayaran
                        </Button>
                    )
                ]}
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    
                    <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                        {!initialValues ? (
                            <Row gutter={16}>
                                <Col span={12}>
                                    <Form.Item label="1. Pilih Customer" style={{marginBottom: 8}} required>
                                        <Select
                                            showSearch
                                            placeholder="Ketik atau Pilih Nama..."
                                            optionFilterProp="children"
                                            loading={loadingPelanggan}
                                            disabled={loadingPelanggan}
                                            onChange={handleCustomerSelect}
                                            value={selectedCustomerName}
                                            filterOption={(input, option) =>
                                                (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                                            }
                                            style={{ width: '100%' }}
                                            notFoundContent={loadingPelanggan ? <Spin size="small" /> : "Tidak ada data"}
                                        >
                                            {pelangganList.map(p => (
                                                <Option key={p.id} value={p.displayName}>
                                                    {p.displayName}
                                                </Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                    {invoiceList.length > 0 && (
                                        <Tag color="blue">Total Sisa Tagihan: {currencyFormatter(maxPayableAmount)}</Tag>
                                    )}
                                </Col>
                                <Col span={12}>
                                    <Form.Item label="2. Total Uang Diterima" style={{marginBottom: 8}} required>
                                        <InputNumber
                                            style={{ width: '100%', fontWeight: 'bold', fontSize: 16 }}
                                            value={totalInputAmount}
                                            onChange={handleTotalBayarChange}
                                            placeholder="Input Nominal..."
                                            disabled={invoiceList.length === 0}
                                            max={maxPayableAmount}
                                            
                                            // --- UPDATE UNTUK SUPPORT KOMA ---
                                            decimalSeparator="," 
                                            step={0.01}
                                            formatter={value => {
                                                if (!value && value !== 0) return 'Rp 0';
                                                // 1. Ubah ke string
                                                const str = String(value);
                                                // 2. Pisahkan bagian bulat dan desimal
                                                const parts = str.split('.');
                                                // 3. Format bagian bulat dengan titik ribuan
                                                parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                                                // 4. Gabungkan dengan koma
                                                return `Rp ${parts.join(',')}`;
                                            }}
                                            parser={value => {
                                                if (!value) return '';
                                                // 1. Hapus 'Rp', spasi, dan titik ribuan. Biarkan koma.
                                                let val = value.replace(/[^\d,]/g, '');
                                                // 2. Ubah koma menjadi titik untuk diproses JS
                                                return val.replace(',', '.');
                                            }}
                                            // ---------------------------------
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>
                        ) : (
                            <Row gutter={16}>
                                <Col span={24}>
                                    <Tag color="blue" style={{fontSize: 14, padding: 5, marginBottom: 10}}>ID: {initialValues.id}</Tag>
                                    <div style={{ fontWeight: 'bold', fontSize: 18 }}>
                                        Total Dibayar: {currencyFormatter(initialValues.totalBayar)}
                                    </div>
                                    <div style={{ color: '#666' }}>
                                        Customer: {initialValues.namaCustomer}
                                    </div>
                                    <div style={{marginTop: 5, fontStyle:'italic', fontSize: 12, color: '#ff4d4f'}}>
                                        *Hapus pembayaran ini untuk mengembalikan saldo dan status invoice.
                                    </div>
                                </Col>
                            </Row>
                        )}
                    </div>

                    <Divider dashed style={{margin: '12px 0'}} />

                    <div style={{ marginBottom: 16 }}>
                        <Text strong>
                            {initialValues ? "3. Rincian Invoice yang Dibayar:" : "3. Rincian Alokasi ke Tagihan:"}
                        </Text>
                        
                        <div style={{ 
                            maxHeight: '350px', 
                            overflowY: 'auto', 
                            border: '1px solid #d9d9d9', 
                            borderRadius: 8, 
                            marginTop: 8, 
                            backgroundColor: '#fff' 
                        }}>
                            {!initialValues ? (
                                isSearching ? (
                                    <div style={{ padding: 30, textAlign: 'center' }}><Spin tip="Mengambil tagihan..." /></div>
                                ) : invoiceList.length === 0 ? (
                                    <Empty 
                                        image={Empty.PRESENTED_IMAGE_SIMPLE} 
                                        description={selectedCustomerName ? "Lunas semua / Tidak ada tagihan" : "Pilih pelanggan dulu"} 
                                        style={{margin: '20px 0'}} 
                                    />
                                ) : (
                                    <List
                                        dataSource={invoiceList}
                                        renderItem={(item) => (
                                            <InvoiceListItem 
                                                key={item.id}
                                                item={item} 
                                                isSelected={selectedInvoiceIds.includes(item.id)}
                                                allocation={paymentAllocations[item.id]}
                                                onToggle={handleToggle}
                                                onNominalChange={handleNominalChange}
                                                readOnly={false}
                                            />
                                        )}
                                    />
                                )
                            ) : (
                                isLoadingHistory ? (
                                    <div style={{ padding: 30, textAlign: 'center' }}><Spin tip="Memuat rincian..." /></div>
                                ) : historyList.length === 0 ? (
                                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Data alokasi tidak ditemukan" />
                                ) : (
                                    <List
                                        dataSource={historyList}
                                        renderItem={(item) => (
                                            <InvoiceListItem 
                                                key={item.id}
                                                item={item} 
                                                isSelected={true} 
                                                allocation={item.amountAllocated}
                                                readOnly={true} 
                                                onToggle={() => {}} 
                                                onNominalChange={() => {}}
                                            />
                                        )}
                                    />
                                )
                            )}
                        </div>
                    </div>

                    <Form.Item label="Keterangan (Opsional)" name="keterangan">
                        <Input.TextArea rows={2} placeholder="Catatan tambahan..." />
                    </Form.Item>

                    <Form.Item label="Upload Bukti (Opsional)" >
                         <Upload
                            listType="picture"
                            fileList={fileList}
                            maxCount={1}
                            beforeUpload={() => false} 
                            onChange={({ fileList: newFileList }) => setFileList(newFileList)}
                         >
                            <Button icon={<PlusOutlined />}>Pilih Gambar</Button>
                         </Upload>
                    </Form.Item>

                </Form>
            </Modal>
        </>
    );
};

export default PembayaranForm;