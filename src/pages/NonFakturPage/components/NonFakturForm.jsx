import React, { useEffect, useState } from 'react';
import { Modal, Form, DatePicker, Select, Input, InputNumber, Button, message } from 'antd';
import { SaveOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { ref, get, set, update, remove, query, orderByKey, startAt, endAt, limitToLast } from 'firebase/database';

import { db } from '../../../api/firebase'; // Sesuaikan path config
import { usePelangganStream } from '../../../hooks/useFirebaseData'; 

const { TextArea } = Input;
const { Option } = Select;

const NonFakturForm = ({ open, onCancel, initialValues }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    
    // Modal Context untuk Confirm Delete
    const [modal, contextHolder] = Modal.useModal();

    // Mengambil list pelanggan untuk Dropdown
    const { pelangganList = [], loadingPelanggan } = usePelangganStream();
    
    const isEditMode = !!initialValues;

    // --- INIT FORM ---
    useEffect(() => {
        if (open) {
            if (initialValues) {
                // Mapping: pastikan nama field sesuai dengan JSON (namaCustomer, totalBayar)
                form.setFieldsValue({
                    tanggal: initialValues.tanggal ? dayjs(initialValues.tanggal) : dayjs(),
                    namaCustomer: initialValues.namaCustomer,
                    totalBayar: initialValues.totalBayar,
                    keterangan: initialValues.keterangan,
                });
            } else {
                form.resetFields();
                form.setFieldsValue({ tanggal: dayjs(), keterangan: 'NITIP' });
            }
        }
    }, [open, initialValues, form]);

    // --- GENERATE ID (VF-YYYY-MM-XXXX) ---
    const generateNewId = async (selectedDate) => {
        const year = selectedDate.format('YYYY');
        const month = selectedDate.format('MM');
        
        // Contoh ID: VF0000000001 (dari JSON user) atau VF-2025-12-0001 (Format baru yg lebih rapi)
        // Disini saya pakai format VF-YYYY-MM-xxxx agar mudah di sort
        const prefixKey = `VF-${year}-${month}-`;
        
        // Query cari data terakhir di bulan tsb
        const q = query(ref(db, 'non_faktur'), orderByKey(), startAt(prefixKey), endAt(prefixKey + '\uf8ff'), limitToLast(1));
        const snapshot = await get(q);
        
        let nextSequence = '0001';
        if (snapshot.exists()) {
            const lastKey = Object.keys(snapshot.val())[0]; 
            // Ambil 4 digit terakhir
            const lastSeq = parseInt(lastKey.split('-').pop(), 10);
            if (!isNaN(lastSeq)) nextSequence = (lastSeq + 1).toString().padStart(4, '0');
        }
        return `${prefixKey}${nextSequence}`;
    };

    // --- DELETE HANDLER ---
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

    // --- SUBMIT HANDLER ---
    const handleFinish = async (values) => {
        setLoading(true);
        try {
            const tgl = values.tanggal;
            
            // Objek Data yang akan disimpan (Sesuaikan variable dengan JSON User)
            const dataToSave = {
                tanggal: tgl.valueOf(), // Timestamp
                namaCustomer: values.namaCustomer,
                totalBayar: values.totalBayar,
                keterangan: values.keterangan || '-',
                sumber: 'NON_FAKTUR',
                updatedAt: Date.now()
            };

            if (isEditMode) {
                // UPDATE
                await update(ref(db, `non_faktur/${initialValues.id}`), { 
                    ...initialValues, // Keep existing fields like ID
                    ...dataToSave 
                });
                message.success('Data diperbarui');
            } else {
                // CREATE
                const newId = await generateNewId(tgl);
                await set(ref(db, `non_faktur/${newId}`), {
                    id: newId, 
                    createdAt: Date.now(),
                    ...dataToSave,
                });
                message.success(`Tersimpan: ${newId}`);
            }
            onCancel();
        } catch (error) {
            console.error(error);
            message.error('Gagal menyimpan data');
        } finally {
            setLoading(false);
        }
    };

    // --- FOOTER BUTTONS ---
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
                    
                    <Form.Item label="Nama Pelanggan" name="namaCustomer" rules={[{ required: true, message: 'Harap pilih pelanggan' }]}>
                        <Select 
                            showSearch 
                            placeholder="Pilih Pelanggan" 
                            optionFilterProp="children" 
                            loading={loadingPelanggan}
                        >
                            <Option value="Umum">Umum</Option>
                            {pelangganList.map(p => (
                                <Option key={p.id} value={p.nama}>{p.nama}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    
                    <Form.Item label="Nominal (Rp)" name="totalBayar" rules={[{ required: true, message: 'Harap isi nominal' }]}>
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