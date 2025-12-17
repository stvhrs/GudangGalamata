// src/pages/pelanggan/components/PelangganForm.jsx
import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Button, message, Spin, Space, InputNumber } from 'antd';
import { db } from '../../../api/firebase';
import { ref, set } from 'firebase/database';

export default function PelangganForm({
    open,
    onCancel,
    onSuccess,
    initialData = null,
    pelangganList
}) {
    const [form] = Form.useForm();
    const [isSaving, setIsSaving] = useState(false);
    const isEditMode = !!initialData;

    useEffect(() => {
        if (isEditMode && initialData) {
            form.setFieldsValue({
                nama: initialData.nama || '',
                telepon: initialData.telepon || '',
                // Set nilai awal (default 0 jika tidak ada)
                saldoAwal: initialData.saldoAwal || 0, 
            });
        } else {
            form.resetFields();
            // Default saldo awal 0 untuk data baru
            form.setFieldsValue({ saldoAwal: 0 }); 
        }
    }, [initialData, form, isEditMode, open]);

    const handleFinish = async (values) => {
        setIsSaving(true);
        message.loading({ content: 'Menyimpan data pelanggan...', key: 'save_pelanggan' });

        try {
            // 1. Normalisasi Data
            const namaRaw = values.nama || '';
            const namaClean = namaRaw.trim().toUpperCase();
            const teleponClean = values.telepon?.trim() || '';
            // Pastikan saldoAwal menjadi angka (float/int)
            const saldoAwalVal = parseFloat(values.saldoAwal) || 0; 

            if (!namaClean) throw new Error("Nama pelanggan tidak boleh kosong.");

            // 2. Cek Duplikat
            const duplicateExists = pelangganList?.some(p =>
                (p.nama?.toUpperCase() === namaClean || (teleponClean && p.telepon === teleponClean)) &&
                (!isEditMode || p.id !== initialData.id)
            );

            if (duplicateExists) {
                throw new Error("Nama atau nomor telepon pelanggan sudah terdaftar.");
            }

            // 3. GENERATE ID & TIME
            let customerId;
            let createdAt;

            if (isEditMode) {
                customerId = initialData.id;
                createdAt = initialData.createdAt || Date.now();
            } else {
                const nameForId = namaClean.replace(/[^a-zA-Z0-9]/g, ""); 
                const uniquePart = Date.now().toString(36).toUpperCase();
                customerId = `CST${nameForId}${uniquePart}`;
                createdAt = Date.now();
            }

            // 4. Payload Data
            const dataToSave = {
                id: customerId,
                nama: namaClean,
                telepon: teleponClean,
                saldoAwal: saldoAwalVal, // SIMPAN DI SINI
                createdAt: createdAt,
                updatedAt: Date.now()
            };

            // 5. Simpan ke Firebase
            await set(ref(db, `customers/${customerId}`), dataToSave);

            message.success({ content: isEditMode ? 'Data diperbarui' : 'Customer berhasil ditambahkan', key: 'save_pelanggan' });
            
            form.resetFields();
            onSuccess();

        } catch (error) {
            console.error("Error saving pelanggan:", error);
            message.error({ content: `Gagal menyimpan: ${error.message}`, key: 'save_pelanggan' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            style={{ top: 20 }}
            title={isEditMode ? 'Edit Customer' : 'Tambah Customer Baru'}
            open={open}
            onCancel={onCancel}
            footer={null}
            destroyOnClose
            maskClosable={false}
        >
            <Spin spinning={isSaving}>
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleFinish}
                >
                    <Form.Item
                        name="nama"
                        label="Nama Customer"
                        normalize={(value) => (value || '').toUpperCase()} 
                        rules={[
                            { required: true, message: 'Nama wajib diisi' },
                            { whitespace: true, message: 'Nama tidak boleh kosong' }
                        ]}
                    >
                        <Input placeholder="MASUKKAN NAMA LENGKAP" />
                    </Form.Item>

                    <Form.Item
                        name="telepon"
                        label="Nomor Telepon"
                        rules={[
                            { pattern: /^[0-9+-\s()]*$/, message: 'Format telepon tidak valid' }
                        ]}
                    >
                        <Input placeholder="Contoh: 08123456789" />
                    </Form.Item>

                    {/* FIELD SALDO AWAL */}
                    <Form.Item
                        name="saldoAwal"
                        label="Saldo Awal (Migrasi)"
                        tooltip="Gunakan tanda minus (-) jika Saldo Awal adalah Hutang/Minus. Gunakan positif jika Deposit."
                    >
                        <InputNumber
                            style={{ width: '100%' }}
                            placeholder="0"
                            // Formatter: Menambah Rp dan titik ribuan
                            formatter={(value) => `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
                            // Parser: Mengembalikan format Rp ke angka murni agar bisa disimpan
                            parser={(value) => value.replace(/\Rp\s?|(\.*)/g, '')}
                        />
                    </Form.Item>

                    <div style={{ textAlign: 'right', marginTop: 24 }}>
                        <Space>
                            <Button onClick={onCancel} disabled={isSaving}>
                                Batal
                            </Button>
                            <Button type="primary" htmlType="submit" loading={isSaving}>
                                {isEditMode ? 'Simpan' : 'Tambah'}
                            </Button>
                        </Space>
                    </div>
                </Form>
            </Spin>
        </Modal>
    );
}