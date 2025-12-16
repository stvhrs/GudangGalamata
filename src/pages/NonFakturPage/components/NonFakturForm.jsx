import React, { useEffect, useState } from 'react';
import { Modal, Form, DatePicker, Select, Input, InputNumber, Button, message } from 'antd';
import { SaveOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
// Tambahkan startAt dan endAt untuk query berdasarkan tanggal
import { ref, get, set, update, remove, query, orderByKey, startAt, endAt, limitToLast } from 'firebase/database';

import { db } from '../../../api/firebase'; 
import { usePelangganStream } from '../../../hooks/useFirebaseData'; 

const { TextArea } = Input;
const { Option } = Select;

const NonFakturForm = ({ open, onCancel, initialValues }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    
    // Modal Context
    const [modal, contextHolder] = Modal.useModal();

    // Data Customer
    const { pelangganList = [], loadingPelanggan } = usePelangganStream();
    
    const isEditMode = !!initialValues;

    // --- 1. INIT FORM ---
    useEffect(() => {
        if (open) {
            if (initialValues) {
                form.setFieldsValue({
                    tanggal: initialValues.tanggal ? dayjs(initialValues.tanggal) : dayjs(),
                    customerId: initialValues.customerId,
                    totalBayar: initialValues.totalBayar,
                    keterangan: initialValues.keterangan,
                });
            } else {
                form.resetFields();
                form.setFieldsValue({ 
                    tanggal: dayjs(), 
                    keterangan: 'NITIP' 
                });
            }
        }
    }, [open, initialValues, form]);

    // --- 2. GENERATE ID (Format: VF-YY-MM-DD-XXXX) ---
    const generateNewId = async (selectedDate) => {
        // Format YY-MM-DD (Contoh: 25-12-16)
        const yy = selectedDate.format('YY');
        const mm = selectedDate.format('MM');
        const dd = selectedDate.format('DD');
        
        // Prefix Tanggal: VF-25-12-16-
        const prefixKey = `NF-${yy}-${mm}-${dd}-`;
        
        // Query cari ID terakhir di HARI ITU
        const q = query(
            ref(db, 'non_faktur'), 
            orderByKey(), 
            startAt(prefixKey), 
            endAt(prefixKey + '\uf8ff'), 
            limitToLast(1)
        );
        
        const snapshot = await get(q);
        
        let nextSeq = '0001'; // Default urutan pertama
        
        if (snapshot.exists()) {
            const lastKey = Object.keys(snapshot.val())[0]; 
            // Contoh lastKey: VF-25-12-16-0005
            
            const parts = lastKey.split('-');
            const lastSeqStr = parts[parts.length - 1]; // Ambil bagian '0005'
            const lastSeqNum = parseInt(lastSeqStr, 10);
            
            if (!isNaN(lastSeqNum)) {
                nextSeq = (lastSeqNum + 1).toString().padStart(4, '0');
            }
        }
        
        // Hasil Akhir: VF-25-12-16-0001
        return `${prefixKey}${nextSeq}`;
    };

    // --- 3. DELETE HANDLER ---
    const handleDelete = () => {
        const targetId = initialValues?.id;
        if (!targetId) return message.error("ID tidak ditemukan.");

        modal.confirm({
            title: 'Hapus Data Non-Faktur?',
            icon: <ExclamationCircleOutlined />,
            content: `Yakin ingin menghapus data ${targetId}?`,
            okText: 'Ya, Hapus',
            okType: 'danger',
            cancelText: 'Batal',
            centered: true,
            onOk: async () => {
                try {
                    await remove(ref(db, `non_faktur/${targetId}`));
                    message.success('Data berhasil dihapus');
                    onCancel();
                } catch (error) {
                    console.error("Gagal Hapus:", error);
                    message.error(`Gagal menghapus: ${error.message}`);
                }
            }
        });
    };

    // --- 4. SUBMIT HANDLER ---
    const handleFinish = async (values) => {
        setLoading(true);
        try {
            const tgl = values.tanggal;

            // Cari Nama Customer
            const selectedCustomer = pelangganList.find(p => p.id === values.customerId);
            const namaCust = selectedCustomer ? selectedCustomer.nama : 'Umum';

            const dataPayload = {
                arah: "IN", 
                sumber: "NON_FAKTUR", 
                
                tanggal: tgl.valueOf(), // Timestamp
                customerId: values.customerId,
                namaCustomer: namaCust,
                totalBayar: values.totalBayar,
                keterangan: values.keterangan || '-',
                
                updatedAt: Date.now()
            };

            if (isEditMode) {
                // UPDATE
                await update(ref(db, `non_faktur/${initialValues.id}`), {
                    ...initialValues,
                    ...dataPayload
                });
                message.success('Data diperbarui');
            } else {
                // CREATE BARU DENGAN ID FORMAT TANGGAL
                const newId = await generateNewId(tgl); // Kirim tanggal yg dipilih user
                
                await set(ref(db, `non_faktur/${newId}`), {
                    id: newId,
                    createdAt: Date.now(),
                    ...dataPayload
                });
                message.success(`Tersimpan: ${newId}`);
            }
            onCancel();
        } catch (error) {
            console.error("Error Saving:", error);
            message.error('Gagal menyimpan data');
        } finally {
            setLoading(false);
        }
    };

    // --- FOOTER ---
    const renderFooter = () => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div>
                {isEditMode && (
                    <Button danger onClick={handleDelete} icon={<DeleteOutlined />}>
                        Hapus
                    </Button>
                )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={onCancel} disabled={loading}>Batal</Button>
                <Button type="primary" onClick={() => form.submit()} loading={loading} icon={<SaveOutlined />}>
                    {isEditMode ? 'Simpan Perubahan' : 'Simpan Data'}
                </Button>
            </div>
        </div>
    );

    return (
        <>
            {contextHolder}
            <Modal
                title={isEditMode ? `Edit Non-Faktur (${initialValues?.id})` : "Input Non-Faktur Baru"}
                open={open}
                onCancel={onCancel}
                footer={renderFooter()} 
                destroyOnClose
                maskClosable={false}
                centered
            >
                <Form form={form} layout="vertical" onFinish={handleFinish}>
                    <Form.Item label="Tanggal" name="tanggal" rules={[{ required: true }]}>
                        <DatePicker format="DD MMM YYYY" style={{ width: '100%' }} />
                    </Form.Item>
                    
                    <Form.Item 
                        label="Nama Customer" 
                        name="customerId" 
                        rules={[{ required: true, message: 'Harap pilih pelanggan' }]}
                    >
                        <Select 
                            showSearch 
                            placeholder="Pilih Customer" 
                            optionFilterProp="children" 
                            loading={loadingPelanggan}
                            filterOption={(input, option) =>
                                (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                        >
                            {pelangganList.map(p => (
                                <Option key={p.id} value={p.id}>
                                    {p.nama}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>
                    
                    <Form.Item 
                        label="Nominal (Rp)" 
                        name="totalBayar" 
                        rules={[{ required: true, message: 'Harap isi nominal' }]}
                    >
                        <InputNumber 
                            style={{ width: '100%' }} 
                            formatter={v => `Rp ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} 
                            parser={v => v.replace(/\Rp\s?|(,*)/g, '')} 
                            min={0} 
                        />
                    </Form.Item>
                    
                    <Form.Item label="Keterangan" name="keterangan">
                        <TextArea rows={3} placeholder="Contoh: NITIP" />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
};

export default NonFakturForm;